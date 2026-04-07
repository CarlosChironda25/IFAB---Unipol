import os
from pathlib import Path
import random
import time
from math import cos, pi, sin
from datetime import datetime
from typing import Any

from fastapi.concurrency import asynccontextmanager
from dotenv import load_dotenv
# Caricamento ENV in cima a tutto
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

from fastapi import FastAPI, Depends, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session, selectinload
from .database import SessionLocal, init_db, get_db
from .scraper import fetch_weather_news, scrape_article_content
from .ai_processor import extract_event_data, geocode_location_hints, get_coordinates, normalize_event_type
from .models import Article, Event, User
import uvicorn

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(title="Extreme Weather Intelligence Platform", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEFAULT_IMPACT_RADII_KM = {
    "flood": 12,
    "hail": 8,
    "wildfire": 14,
    "storm": 10,
    "tornado": 6,
    "earthquake": 18,
    "heatwave": 20,
    "coldwave": 16,
    "drought": 40,
    "blizzard": 14,
    "unknown": 8,
}

ITALIAN_CITY_ANCHORS = [
    {"city": "Torino", "province": "TO", "region": "Piemonte", "latitude": 45.0703, "longitude": 7.6869},
    {"city": "Milano", "province": "MI", "region": "Lombardia", "latitude": 45.4642, "longitude": 9.19},
    {"city": "Bergamo", "province": "BG", "region": "Lombardia", "latitude": 45.6983, "longitude": 9.6773},
    {"city": "Venezia", "province": "VE", "region": "Veneto", "latitude": 45.4408, "longitude": 12.3155},
    {"city": "Trieste", "province": "TS", "region": "Friuli-Venezia Giulia", "latitude": 45.6495, "longitude": 13.7768},
    {"city": "Bologna", "province": "BO", "region": "Emilia-Romagna", "latitude": 44.4949, "longitude": 11.3426},
    {"city": "Parma", "province": "PR", "region": "Emilia-Romagna", "latitude": 44.8015, "longitude": 10.3279},
    {"city": "Firenze", "province": "FI", "region": "Toscana", "latitude": 43.7696, "longitude": 11.2558},
    {"city": "Perugia", "province": "PG", "region": "Umbria", "latitude": 43.1107, "longitude": 12.3908},
    {"city": "Ancona", "province": "AN", "region": "Marche", "latitude": 43.6158, "longitude": 13.5189},
    {"city": "Roma", "province": "RM", "region": "Lazio", "latitude": 41.9028, "longitude": 12.4964},
    {"city": "L'Aquila", "province": "AQ", "region": "Abruzzo", "latitude": 42.3498, "longitude": 13.3995},
    {"city": "Napoli", "province": "NA", "region": "Campania", "latitude": 40.8518, "longitude": 14.2681},
    {"city": "Bari", "province": "BA", "region": "Puglia", "latitude": 41.1171, "longitude": 16.8719},
    {"city": "Potenza", "province": "PZ", "region": "Basilicata", "latitude": 40.6401, "longitude": 15.8051},
    {"city": "Catanzaro", "province": "CZ", "region": "Calabria", "latitude": 38.9098, "longitude": 16.5877},
    {"city": "Palermo", "province": "PA", "region": "Sicilia", "latitude": 38.1157, "longitude": 13.3615},
    {"city": "Catania", "province": "CT", "region": "Sicilia", "latitude": 37.5079, "longitude": 15.083},
    {"city": "Cagliari", "province": "CA", "region": "Sardegna", "latitude": 39.2238, "longitude": 9.1217},
    {"city": "Sassari", "province": "SS", "region": "Sardegna", "latitude": 40.7267, "longitude": 8.5592},
]

FIRST_NAMES = [
    "Luca", "Marco", "Andrea", "Matteo", "Francesco", "Giulia", "Martina", "Chiara", "Sara", "Elena",
    "Alessandro", "Davide", "Federico", "Valentina", "Giorgia", "Anna", "Paolo", "Marta", "Stefano", "Irene",
]

LAST_NAMES = [
    "Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano", "Colombo", "Ricci", "Marino", "Greco",
    "Bruno", "Gallo", "Conti", "De Luca", "Costa", "Giordano", "Mancini", "Lombardi", "Moretti", "Barbieri",
]

POLICY_TYPES = ["Casa", "Business", "Agricola", "Office", "Azienda"]

def choose_event_status(confidence_score: float | None, severity: int | None) -> str:
    confidence = confidence_score or 0.0
    severity_level = severity or 1

    if severity_level >= 4 or (confidence >= 0.72 and severity_level >= 3):
        return "confirmed"

    if confidence >= 0.6 or severity_level >= 3:
        return "updated"

    return "new"

def infer_impact_radius_km(event_type: str | None) -> int:
    return DEFAULT_IMPACT_RADII_KM.get(event_type or "unknown", 8)

def build_circle_polygon(latitude: float, longitude: float, radius_km: float, points: int = 18):
    coordinates = []
    radius_lat = radius_km / 111.32
    radius_lng = radius_km / (111.32 * max(cos(latitude * pi / 180), 0.2))

    for step in range(points):
        angle = (2 * pi * step) / points
        coordinates.append([
            longitude + radius_lng * cos(angle),
            latitude + radius_lat * sin(angle),
        ])

    coordinates.append(coordinates[0])

    return {
        "type": "Polygon",
        "coordinates": [coordinates],
    }

def is_valid_geometry(geometry: Any) -> bool:
    if not isinstance(geometry, dict):
        return False

    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates")
    return geometry_type in {"Polygon", "MultiPolygon"} and isinstance(coordinates, list) and len(coordinates) > 0

def flatten_geometry_points(geometry: dict[str, Any]) -> list[tuple[float, float]]:
    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates")
    points: list[tuple[float, float]] = []

    if geometry_type == "Polygon":
        for ring in coordinates:
            for longitude, latitude in ring:
                points.append((float(longitude), float(latitude)))
    elif geometry_type == "MultiPolygon":
        for polygon in coordinates:
            for ring in polygon:
                for longitude, latitude in ring:
                    points.append((float(longitude), float(latitude)))

    return points

def compute_centroid_from_points(points: list[tuple[float, float]]) -> tuple[float, float] | tuple[None, None]:
    if not points:
        return None, None

    avg_longitude = sum(point[0] for point in points) / len(points)
    avg_latitude = sum(point[1] for point in points) / len(points)
    return avg_latitude, avg_longitude

def cross(o: tuple[float, float], a: tuple[float, float], b: tuple[float, float]) -> float:
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

def build_convex_hull_polygon(points: list[tuple[float, float]]) -> dict[str, Any] | None:
    unique_points = sorted(set(points))
    if len(unique_points) < 3:
        return None

    lower: list[tuple[float, float]] = []
    for point in unique_points:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0:
            lower.pop()
        lower.append(point)

    upper: list[tuple[float, float]] = []
    for point in reversed(unique_points):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0:
            upper.pop()
        upper.append(point)

    hull = lower[:-1] + upper[:-1]
    if len(hull) < 3:
        return None

    ring = [[longitude, latitude] for longitude, latitude in hull]
    ring.append(ring[0])
    return {"type": "Polygon", "coordinates": [ring]}

def build_micro_location_geometry(
    geo_area: dict[str, Any],
    fallback_latitude: float | None = None,
    fallback_longitude: float | None = None,
    fallback_radius_km: float = 2.0,
):
    raw_micro_locations = geo_area.get("micro_locations") or []
    raw_affected_places = geo_area.get("affected_places") or []

    location_names = []
    for value in [*raw_micro_locations, *raw_affected_places]:
        if isinstance(value, str) and value.strip():
            location_names.append(value.strip())

    if not location_names:
        if fallback_latitude is not None and fallback_longitude is not None:
            return build_circle_polygon(fallback_latitude, fallback_longitude, fallback_radius_km), "Fallback circle da centro evento"
        return None, None

    points = geocode_location_hints(
        location_names,
        geo_area.get("admin_area_level1"),
        geo_area.get("admin_area_level2"),
    )

    if len(points) >= 3:
        coordinates = [(float(point["longitude"]), float(point["latitude"])) for point in points]
        geometry = build_convex_hull_polygon(coordinates)
        if geometry:
            return geometry, "Convex hull da micro-localita geocodificate"

    if len(points) == 2:
        coordinates = [(float(point["longitude"]), float(point["latitude"])) for point in points]
        min_longitude = min(point[0] for point in coordinates)
        max_longitude = max(point[0] for point in coordinates)
        min_latitude = min(point[1] for point in coordinates)
        max_latitude = max(point[1] for point in coordinates)
        padding = 0.0025
        return {
            "type": "Polygon",
            "coordinates": [[
                [min_longitude - padding, min_latitude - padding],
                [max_longitude + padding, min_latitude - padding],
                [max_longitude + padding, max_latitude + padding],
                [min_longitude - padding, max_latitude + padding],
                [min_longitude - padding, min_latitude - padding],
            ]],
        }, "Bounding box da due micro-localita geocodificate"

    if len(points) == 1:
        point = points[0]
        return build_circle_polygon(float(point["latitude"]), float(point["longitude"]), fallback_radius_km), "Cerchio ridotto da micro-localita geocodificata"

    if fallback_latitude is not None and fallback_longitude is not None:
        return build_circle_polygon(fallback_latitude, fallback_longitude, fallback_radius_km), "Fallback circle da centro evento"

    return None, None

def serialize_event(event: Event):
    impact_radius_km = event.damage_info.get("radius_km") if isinstance(event.damage_info, dict) else None
    if not isinstance(impact_radius_km, (int, float)) or impact_radius_km <= 0:
        impact_radius_km = infer_impact_radius_km(event.event_type)

    geometry_geojson = event.damage_info.get("geometry_geojson") if isinstance(event.damage_info, dict) else None
    if not is_valid_geometry(geometry_geojson):
        geometry_geojson = None

    if geometry_geojson is None and event.latitude is not None and event.longitude is not None:
        geometry_geojson = build_circle_polygon(event.latitude, event.longitude, impact_radius_km)

    return {
        "id": event.id,
        "event_type": normalize_event_type(event.event_type),
        "main_location": event.main_location,
        "latitude": event.latitude,
        "longitude": event.longitude,
        "start_date": event.start_date.isoformat() if event.start_date else None,
        "last_update": event.last_update.isoformat() if event.last_update else None,
        "damage_info": event.damage_info,
        "confidence_score": event.confidence_score,
        "status": event.status,
        "impact_radius_km": impact_radius_km,
        "geometry_geojson": geometry_geojson,
        "coordinate_source": (
            event.damage_info.get("coordinate_source")
            if isinstance(event.damage_info, dict)
            else None
        ) or (f"Nominatim geocoding da main_location: {event.main_location}" if event.main_location else None),
        "articles": [
            {
                "id": article.id,
                "title": article.title,
                "url": article.url,
                "source": article.source,
                "published_at": article.published_at.isoformat() if article.published_at else None,
                "content": article.content,
            }
            for article in event.articles
        ],
    }



@app.get("/")
def read_root():
    return {"message": "API is running", "status": "ok"}

@app.post("/run-ingestion")
def run_ingestion(
    max_candidates: int = 12,
    max_new_events: int = 5,
    db: Session = Depends(get_db),
):
    articles_metadata = fetch_weather_news(days_back=7, page_size=max_candidates)
    print(f"DEBUG: Trovati {len(articles_metadata)} articoli da NewsAPI.")

    stats = {
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

        url = meta.get("url")

        if db.query(Article).filter(Article.url == url).first():
            stats["duplicates"] += 1
            print(f"SKIP DUPLICATO: {url}")
            continue

        full_text = scrape_article_content(url)
        if not full_text:
            stats["scrape_failed"] += 1
            print(f"SKIP SCRAPE: contenuto insufficiente o inaccessibile per {url}")
            continue

        article_context = (
            f"TITOLO: {meta.get('title') or ''}\n"
            f"DESCRIZIONE: {meta.get('description') or ''}\n"
            f"FONTE: {meta.get('source', {}).get('name') or ''}\n"
            f"URL: {url}\n\n"
            f"TESTO:\n{full_text}"
        )

        extracted_data = extract_event_data(article_context)
        time.sleep(2)

        if not extracted_data or not isinstance(extracted_data, dict) or 'location' not in extracted_data:
            stats["ai_failed"] += 1
            print(f"SKIP AI: estrazione evento fallita per {url}")
            continue

        geo_area = extracted_data.get("geo_area", {}) if isinstance(extracted_data.get("geo_area"), dict) else {}
        centroid_lat = geo_area.get("centroid_lat")
        centroid_lon = geo_area.get("centroid_lon")
        radius_km = geo_area.get("radius_km")
        geo_precision = extracted_data.get("extraction_metadata", {}).get("geo_precision")
        coordinate_source = "AI geo_area.centroid"
        geometry_geojson = geo_area.get("geometry_geojson")
        geometry_source = "AI geometry_geojson" if is_valid_geometry(geometry_geojson) else None

        fallback_lat = float(centroid_lat) if isinstance(centroid_lat, (int, float)) else None
        fallback_lon = float(centroid_lon) if isinstance(centroid_lon, (int, float)) else None
        fallback_radius_km = float(radius_km) if isinstance(radius_km, (int, float)) and radius_km > 0 else 1.5

        if not is_valid_geometry(geometry_geojson):
            geometry_geojson, geometry_source = build_micro_location_geometry(
                geo_area,
                fallback_latitude=fallback_lat,
                fallback_longitude=fallback_lon,
                fallback_radius_km=min(fallback_radius_km, 2.5),
            )
            if geometry_source:
                coordinate_source = geometry_source

        if is_valid_geometry(geometry_geojson):
            centroid_points = flatten_geometry_points(geometry_geojson)
            lat, lon = compute_centroid_from_points(centroid_points)
            if coordinate_source == "AI geo_area.centroid":
                coordinate_source = "AI geometry_geojson"
        elif isinstance(centroid_lat, (int, float)) and isinstance(centroid_lon, (int, float)):
            lat, lon = fallback_lat, fallback_lon
        else:
            lat, lon = get_coordinates(
                extracted_data['location'],
                geo_area.get("admin_area_level1"),
                geo_area.get("admin_area_level2"),
            )
            coordinate_source = f"Nominatim geocoding contestuale da main_location: {extracted_data.get('location')}"

        if not lat or not lon:
            stats["geocode_failed"] += 1
            print(f"SKIP GEO: geocoding fallito per {extracted_data.get('location')} ({url})")
            continue

        if geo_precision == "approximate" and geometry_source in {None, "Fallback circle da centro evento"}:
            stats["precision_rejected"] += 1
            print(f"SKIP PRECISIONE: geo troppo vaga per {extracted_data.get('location')} ({url})")
            continue

        severity = extracted_data.get("severity")
        confidence_score = extracted_data.get('confidence_score', 0.0)
        event_status = choose_event_status(confidence_score, severity if isinstance(severity, int) else None)

        published_at_raw = meta.get("publishedAt")
        published_at = None
        if published_at_raw:
            try:
                published_at = datetime.fromisoformat(published_at_raw.replace("Z", "+00:00"))
            except ValueError:
                published_at = None

        new_event = Event(
            event_type=normalize_event_type(extracted_data.get('event_type')),
            main_location=extracted_data.get('location'),
            latitude=lat,
            longitude=lon,
            damage_info={
                "description": extracted_data.get('damage_description'),
                "geocoded_from": extracted_data.get('location'),
                "coordinate_source": coordinate_source,
                "severity": severity,
                "radius_km": radius_km if isinstance(radius_km, (int, float)) and radius_km > 0 else infer_impact_radius_km(extracted_data.get('event_type')),
                "affected_places": geo_area.get("affected_places"),
                "micro_locations": geo_area.get("micro_locations"),
                "geometry_geojson": geometry_geojson if is_valid_geometry(geometry_geojson) else None,
                "geo_precision": geo_precision,
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
            event_id=new_event.id
        )
        db.add(new_article)
        db.commit()
        stats["events_created"] += 1
        print(f"SUCCESSO: Creato evento a {extracted_data['location']} da {url}")

    return {"status": "completed", **stats}

@app.post("/create-test-users")
def create_test_users(
    count: int = 1000,
    reset_existing: bool = True,
    db: Session = Depends(get_db),
):
    total_users = max(1, min(count, 5000))

    if reset_existing:
        db.query(User).delete()
        db.commit()

    rng = random.Random(42)
    users: list[User] = []

    for index in range(total_users):
        city = ITALIAN_CITY_ANCHORS[index % len(ITALIAN_CITY_ANCHORS)]
        first_name = FIRST_NAMES[index % len(FIRST_NAMES)]
        last_name = LAST_NAMES[(index * 3) % len(LAST_NAMES)]
        latitude = city["latitude"] + rng.uniform(-0.18, 0.18)
        longitude = city["longitude"] + rng.uniform(-0.22, 0.22)
        policy_type = POLICY_TYPES[index % len(POLICY_TYPES)]
        risk_level = round(rng.uniform(0.85, 1.55), 2)

        users.append(
            User(
                full_name=f"{first_name} {last_name}",
                email=f"cliente{index + 1:04d}@demo-unipol.it",
                phone=f"+39 3{rng.randint(10, 49)}{rng.randint(1000000, 9999999)}",
                latitude=latitude,
                longitude=longitude,
                address=f"{city['city']}, {city['province']}, {city['region']}",
                policy_type=policy_type,
                policy_number=f"POL-{index + 1:05d}",
                risk_level=risk_level,
            )
        )

    db.add_all(users)
    db.commit()
    return {"status": "Utenti creati", "count": len(users), "reset_existing": reset_existing}

# endpoit per recureare utenti 
@app.get("/customers")
def get_users(db: Session = Depends(get_db)):
    return db.query(User).all()
#endpoint per recuperare eventi
@app.get("/events")
def get_events(db: Session = Depends(get_db)):
    events = db.query(Event).options(selectinload(Event.articles)).all()
    return [serialize_event(event) for event in events]

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
