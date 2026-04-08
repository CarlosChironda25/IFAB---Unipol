from datetime import datetime, timezone
from math import cos, pi, sin
from typing import Any

from .ai_processor import geocode_location_hints, normalize_event_type
from .constants import DEFAULT_IMPACT_RADII_KM, PRECISE_PLACE_TYPES
from .models import Event


def normalize_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None

    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    return value


def parse_datetime_like(value: str | None) -> datetime | None:
    if not value:
        return None

    raw_value = value.strip()
    if not raw_value:
        return None

    try:
        parsed = datetime.fromisoformat(raw_value.replace("Z", "+00:00"))
        return normalize_datetime(parsed)
    except ValueError:
        pass

    for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            parsed = datetime.strptime(raw_value, fmt)
            return normalize_datetime(parsed)
        except ValueError:
            continue

    return None


def choose_event_status(
    confidence_score: float | None,
    severity: int | None,
    last_article_date: datetime | None = None,
    articles_count: int = 1,
) -> str:
    confidence = confidence_score or 0.0
    severity_level = severity or 1
    reference_date = normalize_datetime(last_article_date)
    age_hours = None

    if reference_date is not None:
        age_hours = (datetime.utcnow() - reference_date).total_seconds() / 3600

    if articles_count >= 2 and confidence >= 0.72 and severity_level >= 3:
        return "confirmed"

    if severity_level >= 4 and confidence >= 0.82:
        return "confirmed"

    if age_hours is not None and age_hours <= 36:
        return "new"

    if age_hours is not None and age_hours <= 24 * 7:
        return "updated"

    if confidence >= 0.58 or severity_level >= 3:
        return "updated"

    return "new"


def derive_event_display_dates(event: Event) -> tuple[datetime | None, datetime | None]:
    article_dates = sorted(
        normalize_datetime(article.published_at)
        for article in event.articles
        if article.published_at is not None
    )
    article_dates = [value for value in article_dates if value is not None]

    if article_dates:
        return article_dates[0], article_dates[-1]

    damage_info = event.damage_info if isinstance(event.damage_info, dict) else {}
    event_date = parse_datetime_like(damage_info.get("event_date")) if damage_info else None
    start_date = event_date or normalize_datetime(event.start_date)
    last_update = normalize_datetime(event.last_update) or start_date
    return start_date, last_update


def infer_impact_radius_km(event_type: str | None) -> int:
    return DEFAULT_IMPACT_RADII_KM.get(event_type or "unknown", 8)


def build_circle_polygon(latitude: float, longitude: float, radius_km: float, points: int = 18) -> dict[str, Any]:
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


def compute_centroid_from_points(points: list[tuple[float, float]]) -> tuple[float | None, float | None]:
    if not points:
        return None, None

    avg_longitude = sum(point[0] for point in points) / len(points)
    avg_latitude = sum(point[1] for point in points) / len(points)
    return avg_latitude, avg_longitude


def estimate_bbox_km(points: list[tuple[float, float]]) -> tuple[float, float]:
    if not points:
        return 0.0, 0.0

    longitudes = [point[0] for point in points]
    latitudes = [point[1] for point in points]
    mean_latitude = sum(latitudes) / len(latitudes)
    width_km = (max(longitudes) - min(longitudes)) * 111.32 * max(cos(mean_latitude * pi / 180), 0.2)
    height_km = (max(latitudes) - min(latitudes)) * 111.32
    return width_km, height_km


def max_distance_from_center_km(points: list[tuple[float, float]], center: tuple[float, float]) -> float:
    center_lat, center_lon = center
    max_distance = 0.0

    for longitude, latitude in points:
        radius_lat = (latitude - center_lat) * 111.32
        radius_lon = (longitude - center_lon) * 111.32 * max(cos(center_lat * pi / 180), 0.2)
        distance = (radius_lat ** 2 + radius_lon ** 2) ** 0.5
        if distance > max_distance:
            max_distance = distance

    return max_distance


def is_geometry_sane_for_local_event(
    geometry_geojson: dict[str, Any] | None,
    geo_precision: str | None,
    impact_scope: str | None,
    fallback_center: tuple[float, float] | None,
) -> bool:
    if not is_valid_geometry(geometry_geojson):
        return False

    points = flatten_geometry_points(geometry_geojson)
    if not points:
        return False

    width_km, height_km = estimate_bbox_km(points)
    center = fallback_center
    if center is None:
        centroid = compute_centroid_from_points(points)
        if centroid == (None, None):
            return False
        center = centroid

    max_radius_km = max_distance_from_center_km(points, center)

    if geo_precision in {"exact_address", "street", "poi"} or impact_scope in {"site", "street"}:
        return width_km <= 3.5 and height_km <= 3.5 and max_radius_km <= 2.0

    if geo_precision == "district" or impact_scope == "district":
        return width_km <= 8.0 and height_km <= 8.0 and max_radius_km <= 5.0

    if geo_precision in {"city", "region", "approximate"} or impact_scope in {"city", "regional"}:
        return False

    return width_km <= 5.0 and height_km <= 5.0 and max_radius_km <= 3.0


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
) -> tuple[dict[str, Any] | None, str | None]:
    raw_micro_locations = geo_area.get("micro_locations") or []

    location_names = []
    source_values = raw_micro_locations if raw_micro_locations else (geo_area.get("affected_places") or [])
    for value in source_values:
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

    if fallback_latitude is not None and fallback_longitude is not None and points:
        filtered_points = []
        max_distance_km = 5 if raw_micro_locations else 12
        for point in points:
            distance_km = (
                ((float(point["latitude"]) - fallback_latitude) ** 2 + (float(point["longitude"]) - fallback_longitude) ** 2) ** 0.5
                * 111
            )
            if distance_km <= max_distance_km:
                filtered_points.append(point)
        if filtered_points:
            points = filtered_points

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
        return (
            build_circle_polygon(float(point["latitude"]), float(point["longitude"]), fallback_radius_km),
            "Cerchio ridotto da micro-localita geocodificata",
        )

    if fallback_latitude is not None and fallback_longitude is not None:
        return build_circle_polygon(fallback_latitude, fallback_longitude, fallback_radius_km), "Fallback circle da centro evento"

    return None, None


def serialize_event(event: Event) -> dict[str, Any]:
    display_start_date, display_last_update = derive_event_display_dates(event)
    damage_info = event.damage_info if isinstance(event.damage_info, dict) else {}
    derived_status = choose_event_status(
        event.confidence_score,
        damage_info.get("severity") if isinstance(damage_info.get("severity"), int) else None,
        last_article_date=display_last_update,
        articles_count=len(event.articles),
    )
    impact_radius_km = damage_info.get("radius_km")
    if not isinstance(impact_radius_km, (int, float)) or impact_radius_km <= 0:
        impact_radius_km = infer_impact_radius_km(event.event_type)

    geometry_geojson = damage_info.get("geometry_geojson")
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
        "start_date": display_start_date.isoformat() if display_start_date else None,
        "last_update": display_last_update.isoformat() if display_last_update else None,
        "damage_info": event.damage_info,
        "confidence_score": event.confidence_score,
        "status": derived_status,
        "impact_radius_km": impact_radius_km,
        "geometry_geojson": geometry_geojson,
        "coordinate_source": damage_info.get("coordinate_source") or (f"Nominatim geocoding da main_location: {event.main_location}" if event.main_location else None),
        "geometry_source": damage_info.get("geometry_source"),
        "geo_precision": damage_info.get("geo_precision"),
        "articles": [
            {
                "id": article.id,
                "title": article.title,
                "url": article.url,
                "source": article.source,
                "published_at": normalize_datetime(article.published_at).isoformat() if article.published_at else None,
                "content": article.content,
            }
            for article in sorted(
                event.articles,
                key=lambda article: normalize_datetime(article.published_at) or datetime.min,
                reverse=True,
            )
        ],
    }


def is_large_area_event(event: Event, max_radius_km: float) -> bool:
    damage_info = event.damage_info if isinstance(event.damage_info, dict) else {}
    radius_km = damage_info.get("radius_km")
    geo_precision = damage_info.get("geo_precision")
    impact_scope = damage_info.get("impact_scope")
    geometry_source = damage_info.get("geometry_source")

    if isinstance(radius_km, (int, float)) and float(radius_km) > max_radius_km:
        return True

    if geo_precision in {"city", "region", "approximate"}:
        return True

    if impact_scope in {"city", "regional"}:
        return True

    if geometry_source in {None, "Fallback circle da centro evento"} and isinstance(radius_km, (int, float)) and float(radius_km) > 2.5:
        return True

    return False
