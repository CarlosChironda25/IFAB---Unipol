import google.generativeai as genai
import os
import json
from dotenv import load_dotenv
from geopy.geocoders import Nominatim
from pathlib import Path
from typing import Iterable
import googlemaps

from .constants import PRECISE_PLACE_TYPES

# Caricamento ENV
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

# Configurazione semplice
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
try:
    print("--- VERIFICA MODELLI DISPONIBILI ---")
    for m in genai.list_models():
        if 'generateContent' in m.supported_generation_methods:
            print(f"Modello trovato: {m.name}")
    print("------------------------------------")
except Exception as e:
    print(f"ERRORE INIZIALIZZAZIONE: {e}")

# Usa il nome del modello senza il prefisso 'models/'
model = genai.GenerativeModel('models/gemma-3-4b-it')

def _build_aliases(*values: str) -> set[str]:
    aliases: set[str] = set()
    for value in values:
        lowered = value.strip().lower()
        aliases.add(lowered)
        aliases.add(lowered.replace("-", " "))
        aliases.add(lowered.replace("_", " "))
        aliases.add(lowered.replace("'", " "))
    return aliases

EVENT_TYPE_ALIASES: dict[str, set[str]] = {
    "flood": _build_aliases(
        "flood",
        "flash flood",
        "river flood",
        "urban flood",
        "coastal flood",
        "alluvione",
        "allagamento",
        "esondazione",
        "nubifragio",
        "bomba d'acqua",
    ),
    "hail": _build_aliases(
        "hail",
        "hailstorm",
        "grandine",
        "grandinata",
    ),
    "storm": _build_aliases(
        "storm",
        "severe storm",
        "thunderstorm",
        "windstorm",
        "tempesta",
        "temporale",
        "maltempo",
        "vento estremo",
    ),
    "tornado": _build_aliases(
        "tornado",
        "tromba d'aria",
        "tromba aria",
    ),
    "wildfire": _build_aliases(
        "wildfire",
        "forest fire",
        "brush fire",
        "incendio",
        "incendio boschivo",
        "rogo",
    ),
    "earthquake": _build_aliases(
        "earthquake",
        "terremoto",
        "sisma",
        "scossa",
    ),
    "other": _build_aliases(
        "other",
        "altro",
        "unknown",
        "sconosciuto",
    ),
    "blizzard": _build_aliases(
        "blizzard",
        "tormenta",
        "bufera di neve",
        "nevicata eccezionale",
        "neve",
    ),
    "drought": _build_aliases(
        "drought",
        "siccità",
        "siccita",
        "secca",
    ),
    "heatwave": _build_aliases(
        "heatwave",
        "heat wave",
        "ondata di calore",
        "caldo estremo",
    ),
    "coldwave": _build_aliases(
        "coldwave",
        "cold wave",
        "ondata di freddo",
        "gelo",
        "freddo estremo",
    ),
}

def normalize_event_type(raw_event_type: str | None) -> str:
    if not raw_event_type:
        return "unknown"

    candidates = {
        raw_event_type.strip().lower(),
        raw_event_type.strip().lower().replace("-", " "),
        raw_event_type.strip().lower().replace("_", " "),
        raw_event_type.strip().lower().replace("'", " "),
    }

    for canonical, aliases in EVENT_TYPE_ALIASES.items():
        if candidates & aliases:
            return canonical

    return "unknown"

def normalize_enum_value(raw_value: str | None, allowed_values: set[str], default: str) -> str:
    if not raw_value:
        return default

    normalized = raw_value.strip().lower().replace("_", " ").replace("-", " ")
    separators = ["|", ",", ";", "/"]
    candidates = {normalized}

    for separator in separators:
        if separator in normalized:
            candidates.update(part.strip() for part in normalized.split(separator) if part.strip())

    for candidate in candidates:
        canonical = candidate.replace(" ", "_")
        if canonical in allowed_values:
            return canonical

    return default

def normalize_geo_precision(raw_value: str | None) -> str:
    return normalize_enum_value(
        raw_value,
        {
            "exact_address",
            "street",
            "poi",
            "district",
            "city",
            "region",
            "approximate",
        },
        "approximate",
    )

def normalize_impact_scope(raw_value: str | None) -> str:
    return normalize_enum_value(
        raw_value,
        {"site", "street", "district", "city", "regional"},
        "regional",
    )

gmaps = googlemaps.Client(key=os.environ["GOOGLE_MAPS_API_KEY"])


def geocode_location(place_name: str, country_hint: str = "IT") -> dict | None:
    """Chiama Google Maps Geocoding e restituisce lat/lon + bounds."""
    try:
        results = gmaps.geocode(place_name, region=country_hint, language="it")
        if not results:
            return None
        r = results[0]
        loc = r["geometry"]["location"]
        bounds = r["geometry"].get("bounds") or r["geometry"].get("viewport")
        place_type = r["types"][0] if r.get("types") else "unknown"
        return {
            "lat": loc["lat"],
            "lon": loc["lng"],
            "formatted_address": r.get("formatted_address"),
            "place_type": place_type,   # route | street_address | locality | ...
            "bounds": bounds,           # NE + SW corner → usato per il poligono
            "place_id": r.get("place_id"),
        }
    except Exception as e:
        print(f"Geocoding fallito per '{place_name}': {e}")
        return None


def build_polygon_from_bounds(bounds: dict, radius_km: float) -> dict | None:
    """
    Se Google Maps ha restituito bounds precisi (es. per una via o quartiere),
    usa quelli per costruire il poligono.
    Altrimenti costruisce un cerchio approssimato attorno al centroide.
    """
    if bounds:
        ne = bounds["northeast"]
        sw = bounds["southwest"]
        # Piccolo padding (10%) per non tagliare i bordi
        pad_lat = (ne["lat"] - sw["lat"]) * 0.1
        pad_lon = (ne["lng"] - sw["lng"]) * 0.1
        coords = [
            [sw["lng"] - pad_lon, sw["lat"] - pad_lat],
            [ne["lng"] + pad_lon, sw["lat"] - pad_lat],
            [ne["lng"] + pad_lon, ne["lat"] + pad_lat],
            [sw["lng"] - pad_lon, ne["lat"] + pad_lat],
            [sw["lng"] - pad_lon, sw["lat"] - pad_lat],  # chiude il poligono
        ]
        return {"type": "Polygon", "coordinates": [coords]}

    # Fallback: cerchio approssimato (8 punti) attorno al centroide
    # (solo se bounds non disponibili, es. per regioni ampie)
    return None  # il frontend gestisce il cerchio lato mappa


def resolve_geo(payload: dict) -> dict:
    """
    Post-processa il payload di Gemini:
    - prende primary_location + micro_locations
    - li geocodifica con Google Maps
    - sostituisce centroid_lat/lon e geometry_geojson con dati precisi
    """
    geo = payload.get("geo_area", {})
    country = geo.get("admin_area_level2", "IT")

    # 1. Geocodifica il luogo principale
    primary = geo.get("primary_location", "")
    admin1  = geo.get("admin_area_level1", "")

    # Componi una query più specifica aggiungendo la regione/provincia
    query = f"{primary}, {admin1}, {country}" if admin1 else f"{primary}, {country}"
    geocoded = geocode_location(query, country_hint=country[:2].upper())

    if geocoded:
        geo["centroid_lat"] = geocoded["lat"]
        geo["centroid_lon"] = geocoded["lon"]
        geo["_geocoded_address"] = geocoded["formatted_address"]
        geo["_place_type"] = geocoded["place_type"]

        # Stima radius_km in base al tipo di luogo se Gemini non era preciso
        if not geo.get("radius_km") or geo["radius_km"] > 200:
            type_radius = {
                "route": 0.5, "street_address": 0.3, "neighborhood": 1.5,
                "locality": 5, "administrative_area_level_3": 15,
                "administrative_area_level_2": 40, "administrative_area_level_1": 120,
            }
            geo["radius_km"] = type_radius.get(geocoded["place_type"], 10)

        # Costruisci il poligono dai bounds reali
        polygon = build_polygon_from_bounds(geocoded["bounds"], geo["radius_km"]) if geocoded["place_type"] in PRECISE_PLACE_TYPES else None
        if polygon:
            geo["geometry_geojson"] = polygon

    # 2. Geocodifica le micro-locations (vie, quartieri, argini…)
    micro_results = []
    for place in geo.get("micro_locations", []):
        micro_query = f"{place}, {primary}, {country}"
        micro_geo = geocode_location(micro_query, country_hint=country[:2].upper())
        if micro_geo:
            micro_results.append({
                "name": place,
                "lat": micro_geo["lat"],
                "lon": micro_geo["lon"],
                "formatted_address": micro_geo["formatted_address"],
                "place_type": micro_geo["place_type"],
                "bounds": micro_geo["bounds"],
            })

    if micro_results:
        geo["micro_locations_geocoded"] = micro_results

        # Se ci sono più micro-location, ricalcola il centroide come media
        if len(micro_results) >= 2:
            avg_lat = sum(m["lat"] for m in micro_results) / len(micro_results)
            avg_lon = sum(m["lon"] for m in micro_results) / len(micro_results)
            geo["centroid_lat"] = avg_lat
            geo["centroid_lon"] = avg_lon
            geo["radius_km"] = min(geo.get("radius_km") or 1.0, 1.2)
        else:
            precise_micro = next(
                (item for item in micro_results if item.get("place_type") in PRECISE_PLACE_TYPES and item.get("bounds")),
                None,
            )
            if precise_micro:
                geo["centroid_lat"] = precise_micro["lat"]
                geo["centroid_lon"] = precise_micro["lon"]
                geo["radius_km"] = 0.35 if precise_micro["place_type"] in {"street_address", "premise", "subpremise"} else 0.8
                polygon = build_polygon_from_bounds(precise_micro["bounds"], geo["radius_km"])
                if polygon:
                    geo["geometry_geojson"] = polygon

    precise_micro_count = sum(1 for item in micro_results if item.get("place_type") in PRECISE_PLACE_TYPES)
    geo["_precise_micro_count"] = precise_micro_count

    payload["geo_area"] = geo
    # Aggiorna anche i campi flat retrocompatibili
    payload["location"] = geo.get("primary_location")
    return payload


def extract_event_data(article_text: str) -> dict | None:
    try:
        system_instruction = """
Sei un sistema di estrazione dati per eventi meteorologici estremi.
Rispondi SEMPRE e SOLO con un oggetto JSON valido. Nessun testo aggiuntivo, nessun markdown.
"""
        prompt = f"""
Analizza il seguente articolo e determina se descrive un episodio di danno localizzato causato da un evento meteorologico estremo
(alluvione, esondazione, grandine, tempesta, tromba d'aria, nevicata eccezionale,
siccità grave, incendio boschivo, ondata di calore/gelo).
Accetta SOLO notizie di cronaca su un evento realmente accaduto o in corso, con luogo fisico e impatti concreti.
Cerchiamo episodi iper-locali come: una via allagata, un ponte chiuso, un lungomare danneggiato,
un faro, un porto, un argine, una frazione, un quartiere, un sottopasso o un edificio specifico colpito dal meteo.
Se il testo è uno studio, report, analisi, previsione, commento o una notizia troppo ampia a livello comunale/regionale,
rispondi: NULL
Se non riesci a identificare almeno un luogo fisico specifico tra strada, quartiere, frazione, POI o tratto territoriale, rispondi: NULL
Nel testo in input possono comparire anche breadcrumb, sottotitolo, caption immagini, alt immagini, keyword SEO e altri metadati HTML:
usali come segnali aggiuntivi per recuperare tutti i luoghi utili, ma NON inventare luoghi che non siano supportati dal contenuto.
Se trovi più punti geografici specifici, includili tutti in micro_locations mantenendo i nomi originali quanto più possibile.

Se lo è, estrai i dati seguendo ESATTAMENTE questo schema JSON.
NON inventare coordinate — lascia centroid_lat/lon a null e geometry_geojson a null.
Il geocoding verrà fatto separatamente con Google Maps.
Concentrati sull'estrarre i NOMI dei luoghi nel modo più preciso possibile.

{{
  "event_type": "flood | hail | storm | tornado | wildfire | drought | blizzard | heatwave | coldwave | other",
  "severity": <1-5>,
  "geo_area": {{
    "primary_location": "nome città/area principale COME SCRITTO nell'articolo",
    "admin_area_level1": "provincia o regione",
    "admin_area_level2": "nazione in inglese, es. Italy",
    "centroid_lat": null,
    "centroid_lon": null,
    "radius_km": null,
    "affected_places": ["tutti i comuni/città menzionati"],
    "micro_locations": ["vie, quartieri, ponti, argini, frazioni, torrenti, lungofiumi"],
    "geometry_geojson": null
  }},
  "temporal": {{
    "event_date": "YYYY-MM-DD",
    "event_date_confidence": "exact | approximate | inferred",
    "duration_hours": <float o null>
  }},
  "damage": {{
    "description": "descrizione sintetica in italiano",
    "casualties": <int o null>,
    "displaced_people": <int o null>,
    "affected_area_km2": <float o null>
  }},
  "extraction_metadata": {{
    "confidence_score": <0.0-1.0>,
    "geo_precision": "exact_address | street | poi | district | city | region | approximate",
    "impact_scope": "site | street | district | city | regional",
    "missing_fields": []
  }}
}}

Testo: {article_text}
"""
        response = model.generate_content(
            [system_instruction, prompt],
            generation_config={"temperature": 0.1}
        )

        if not response or not response.text:
            return None

        raw = response.text.strip()
        if raw.upper() == "NULL" or ("NULL" in raw.upper() and len(raw) < 20):
            return None

        content = raw
        if "```" in content:
            content = content.split("```json")[-1].split("```")[0].strip()

        payload = json.loads(content)
        if not isinstance(payload, dict):
            return None

        payload["event_type"] = normalize_event_type(payload.get("event_type"))
        extraction_metadata = payload.get("extraction_metadata", {})
        if isinstance(extraction_metadata, dict):
            extraction_metadata["geo_precision"] = normalize_geo_precision(extraction_metadata.get("geo_precision"))
            extraction_metadata["impact_scope"] = normalize_impact_scope(extraction_metadata.get("impact_scope"))
            payload["extraction_metadata"] = extraction_metadata

        # ← QUI entra il geocoding reale
        payload = resolve_geo(payload)

        payload["event_date"]         = payload.get("temporal", {}).get("event_date")
        payload["damage_description"]  = payload.get("damage", {}).get("description")
        payload["confidence_score"]    = payload.get("extraction_metadata", {}).get("confidence_score")

        return payload

    except json.JSONDecodeError as e:
        print(f"ERRORE parsing JSON: {e}\nRisposta raw: {response.text[:300]}")
        return None
    except Exception as e:
        print(f"ERRORE AI: {e}")
        return None

# Geocoding
geolocator = Nominatim(user_agent="weather_platform_ifab")

def get_coordinates(location_name: str, admin_area_level1: str | None = None, admin_area_level2: str | None = None):
    if not location_name:
        return None, None

    try:
        clean_loc = location_name.split('(')[0].strip()
        queries = []

        if admin_area_level1 and admin_area_level2:
            queries.append(f"{clean_loc}, {admin_area_level1}, {admin_area_level2}")
        if admin_area_level1:
            queries.append(f"{clean_loc}, {admin_area_level1}, Italia")
        queries.append(f"{clean_loc}, Italia")

        for query in queries:
            location = geolocator.geocode(query, timeout=10)
            if location:
                return location.latitude, location.longitude

        return None, None
    except Exception:
        return None, None

def geocode_location_hints(
    location_names: Iterable[str],
    admin_area_level1: str | None = None,
    admin_area_level2: str | None = None,
    limit: int = 8,
):
    points: list[dict[str, float | str]] = []
    seen_queries: set[str] = set()

    for raw_name in location_names:
        if not raw_name:
            continue

        clean_name = raw_name.split("(")[0].strip()
        if not clean_name:
            continue

        candidate_key = clean_name.lower()
        if candidate_key in seen_queries:
            continue
        seen_queries.add(candidate_key)

        latitude, longitude = get_coordinates(clean_name, admin_area_level1, admin_area_level2)
        if latitude is None or longitude is None:
            continue

        points.append({
            "name": clean_name,
            "latitude": latitude,
            "longitude": longitude,
        })

        if len(points) >= limit:
            break

    return points
