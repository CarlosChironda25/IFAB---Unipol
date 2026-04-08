import time
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from .ai_processor import extract_event_data, normalize_event_type
from .constants import PRECISE_PLACE_TYPES
from .event_logic import (
    build_micro_location_geometry,
    choose_event_status,
    infer_impact_radius_km,
    is_geometry_sane_for_local_event,
    is_valid_geometry,
    parse_datetime_like,
)
from .models import Article, Event
from .scraper import fetch_weather_news, scrape_article_content


def merge_location_hints(existing_values: Any, extra_values: Any, limit: int = 16) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()

    for collection in (existing_values or [], extra_values or []):
        if not isinstance(collection, list):
            continue
        for value in collection:
            if not isinstance(value, str):
                continue
            cleaned = value.strip()
            if not cleaned:
                continue
            key = cleaned.casefold()
            if key in seen:
                continue
            seen.add(key)
            merged.append(cleaned)
            if len(merged) >= limit:
                return merged

    return merged


def build_scraped_geo_signals(scraped_payload: dict[str, Any]) -> list[str]:
    signal_sections = [
        ("headline", "HEADLINE", 1),
        ("subheadline", "SOTTO-TITOLO", 1),
        ("breadcrumbs", "BREADCRUMB", 12),
        ("captions", "CAPTION", 6),
        ("image_alts", "ALT IMMAGINI", 6),
        ("list_items", "LISTE/PUNTI CHIAVE", 8),
        ("json_ld_fragments", "JSON-LD/SEO", 8),
        ("meta_fragments", "META TAG", 6),
        ("place_hints", "PLACE HINTS HTML", 12),
    ]
    geo_signals: list[str] = []

    for key, label, limit in signal_sections:
        value = scraped_payload.get(key)
        if not value:
            continue

        if isinstance(value, str):
            geo_signals.append(f"{label}: {value}")
            continue

        if isinstance(value, list):
            separator = " > " if key == "breadcrumbs" else " | "
            geo_signals.append(f"{label}: {separator.join(value[:limit])}")

    return geo_signals


def build_article_context(
    meta: dict[str, Any],
    url: str,
    full_text: str,
    scraped_payload: dict[str, Any],
) -> str:
    geo_signals = build_scraped_geo_signals(scraped_payload)
    geo_signal_block = "\n".join(geo_signals)

    return (
        f"TITOLO: {meta.get('title') or ''}\n"
        f"DESCRIZIONE: {meta.get('description') or ''}\n"
        f"FONTE: {meta.get('source', {}).get('name') or ''}\n"
        f"URL: {url}\n\n"
        f"{geo_signal_block + chr(10) + chr(10) if geo_signal_block else ''}"
        f"TESTO:\n{full_text}"
    )


def enrich_geo_area_from_scrape(geo_area: dict[str, Any], scraped_payload: dict[str, Any]) -> dict[str, Any]:
    geo_area["micro_locations"] = merge_location_hints(
        geo_area.get("micro_locations"),
        scraped_payload.get("place_hints"),
        limit=18,
    )
    geo_area["affected_places"] = merge_location_hints(
        geo_area.get("affected_places"),
        scraped_payload.get("breadcrumbs"),
        limit=12,
    )
    return geo_area


def derive_ingestion_dates(meta: dict[str, Any], extracted_data: dict[str, Any]) -> tuple[datetime, datetime, datetime | None]:
    published_at = parse_datetime_like(str(meta.get("publishedAt"))) if meta.get("publishedAt") else None
    event_date = parse_datetime_like(extracted_data.get("event_date"))
    start_date = event_date or published_at or datetime.utcnow()
    last_update = published_at or event_date or start_date
    return start_date, last_update, published_at


def ingest_article_metadata(meta: dict[str, Any], db: Session) -> dict[str, Any]:
    url = meta.get("url")
    if not url:
        return {"status": "skipped", "reason": "missing-url"}

    if db.query(Article).filter(Article.url == url).first():
        return {"status": "skipped", "reason": "duplicate", "url": url}

    scraped_payload = scrape_article_content(url)
    if not scraped_payload:
        return {"status": "skipped", "reason": "scrape-failed", "url": url}

    full_text = scraped_payload.get("text")
    if not full_text:
        return {"status": "skipped", "reason": "scrape-failed", "url": url}

    article_context = build_article_context(meta, url, full_text, scraped_payload)

    extracted_data = extract_event_data(article_context)
    time.sleep(2)

    if not extracted_data or not isinstance(extracted_data, dict) or "location" not in extracted_data:
        return {"status": "skipped", "reason": "ai-failed", "url": url}

    geo_area = extracted_data.get("geo_area", {}) if isinstance(extracted_data.get("geo_area"), dict) else {}
    geo_area = enrich_geo_area_from_scrape(geo_area, scraped_payload)
    centroid_lat = geo_area.get("centroid_lat")
    centroid_lon = geo_area.get("centroid_lon")
    radius_km = geo_area.get("radius_km")
    geo_precision = extracted_data.get("extraction_metadata", {}).get("geo_precision")
    impact_scope = extracted_data.get("extraction_metadata", {}).get("impact_scope")
    precise_micro_count = geo_area.get("_precise_micro_count", 0)
    place_type = geo_area.get("_place_type")
    coordinate_source = geo_area.get("_geocoded_address", "Google Maps geocoding")
    geometry_geojson = geo_area.get("geometry_geojson")

    lat = float(centroid_lat) if isinstance(centroid_lat, (int, float)) else None
    lon = float(centroid_lon) if isinstance(centroid_lon, (int, float)) else None

    if not lat or not lon:
        return {"status": "skipped", "reason": "geocode-failed", "url": url, "location": extracted_data.get("location")}

    has_precise_anchor = bool(precise_micro_count) or place_type in PRECISE_PLACE_TYPES

    if impact_scope in {"city", "regional"} or geo_precision in {"city", "region", "approximate"}:
        if not has_precise_anchor or not is_valid_geometry(geometry_geojson):
            return {"status": "skipped", "reason": "precision-rejected", "url": url, "location": extracted_data.get("location")}

    geometry_source = None
    if not is_valid_geometry(geometry_geojson):
        fallback_radius_km = (
            min(float(radius_km), 2.5)
            if isinstance(radius_km, (int, float)) and radius_km > 0
            else 1.5
        )

        geometry_geojson, geometry_source = build_micro_location_geometry(
            geo_area,
            fallback_latitude=lat,
            fallback_longitude=lon,
            fallback_radius_km=fallback_radius_km,
        )

        if geometry_source:
            coordinate_source = geometry_source

    if geo_precision == "approximate" and geometry_source in {None, "Fallback circle da centro evento"}:
        return {"status": "skipped", "reason": "precision-rejected", "url": url, "location": extracted_data.get("location")}

    if isinstance(radius_km, (int, float)) and float(radius_km) > 3.5 and geometry_source in {None, "Fallback circle da centro evento"}:
        return {"status": "skipped", "reason": "precision-rejected", "url": url, "location": extracted_data.get("location")}

    fallback_center = (lat, lon) if lat is not None and lon is not None else None
    if is_valid_geometry(geometry_geojson):
        if not is_geometry_sane_for_local_event(geometry_geojson, geo_precision, impact_scope, fallback_center):
            return {"status": "skipped", "reason": "geometry-too-large", "url": url, "location": extracted_data.get("location")}

    start_date, last_update, published_at = derive_ingestion_dates(meta, extracted_data)
    severity = extracted_data.get("severity")
    confidence_score = extracted_data.get("confidence_score", 0.0)
    event_status = choose_event_status(
        confidence_score,
        severity if isinstance(severity, int) else None,
        last_article_date=last_update,
        articles_count=1,
    )

    new_event = Event(
        event_type=normalize_event_type(extracted_data.get("event_type")),
        main_location=extracted_data.get("location"),
        latitude=lat,
        longitude=lon,
        start_date=start_date,
        last_update=last_update,
        damage_info={
            "description": extracted_data.get("damage_description"),
            "geocoded_from": extracted_data.get("location"),
            "coordinate_source": coordinate_source,
            "geometry_source": geometry_source,
            "severity": severity,
            "event_date": extracted_data.get("event_date"),
            "event_date_confidence": extracted_data.get("temporal", {}).get("event_date_confidence")
            if isinstance(extracted_data.get("temporal"), dict)
            else None,
            "radius_km": radius_km if isinstance(radius_km, (int, float)) and radius_km > 0 else infer_impact_radius_km(extracted_data.get("event_type")),
            "affected_places": geo_area.get("affected_places"),
            "micro_locations": geo_area.get("micro_locations"),
            "geometry_geojson": geometry_geojson if is_valid_geometry(geometry_geojson) else None,
            "geo_precision": geo_precision,
            "impact_scope": impact_scope,
            "place_type": place_type,
        },
        confidence_score=confidence_score,
        status=event_status,
    )
    db.add(new_event)
    db.commit()
    db.refresh(new_event)

    new_article = Article(
        title=meta.get("title"),
        url=url,
        source=meta.get("source", {}).get("name"),
        content=full_text,
        published_at=published_at,
        event_id=new_event.id,
    )
    db.add(new_article)
    db.commit()

    return {
        "status": "created",
        "event_id": new_event.id,
        "main_location": new_event.main_location,
        "url": url,
    }


def run_ingestion_batch(
    db: Session,
    days_back: int = 31,
    max_candidates: int = 12,
    max_new_events: int = 5,
) -> dict[str, Any]:
    fetch_result = fetch_weather_news(days_back=max(1, min(days_back, 365)), page_size=max_candidates)
    articles_metadata = fetch_result.get("articles", [])
    print(
        "DEBUG: candidati="
        f"{len(articles_metadata)} provider={fetch_result.get('provider')} "
        f"raw={fetch_result.get('raw_results')} filtered={fetch_result.get('filtered_results')}"
    )

    stats = {
        "provider": fetch_result.get("provider"),
        "days_back_used": max(1, min(days_back, 365)),
        "raw_results": fetch_result.get("raw_results", 0),
        "filtered_results": fetch_result.get("filtered_results", 0),
        "strict_results": fetch_result.get("strict_results", 0),
        "broad_results": fetch_result.get("broad_results", 0),
        "candidates_found": len(articles_metadata),
        "duplicates": 0,
        "scrape_failed": 0,
        "ai_failed": 0,
        "geocode_failed": 0,
        "precision_rejected": 0,
        "events_created": 0,
    }

    for meta in articles_metadata[:max_candidates]:
        if stats["events_created"] >= max_new_events:
            break

        result = ingest_article_metadata(meta, db)
        if result["status"] == "created":
            stats["events_created"] += 1
            print(f"SUCCESSO: Creato evento a {result.get('main_location')} da {result.get('url')}")
            continue

        reason = result.get("reason")
        if reason == "duplicate":
            stats["duplicates"] += 1
        elif reason == "scrape-failed":
            stats["scrape_failed"] += 1
        elif reason == "ai-failed":
            stats["ai_failed"] += 1
        elif reason == "geocode-failed":
            stats["geocode_failed"] += 1
        elif reason in {"precision-rejected", "geometry-too-large"}:
            stats["precision_rejected"] += 1

    return {"status": "completed", **stats}


def build_manual_article_meta(url: str, title: str | None = None, source: str | None = None) -> dict[str, Any]:
    return {
        "title": title or url,
        "description": "",
        "url": url,
        "publishedAt": datetime.utcnow().isoformat(),
        "source": {"name": source or Path(url).name or "manual"},
    }
