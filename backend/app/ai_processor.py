import google.generativeai as genai
import os
import json
from dotenv import load_dotenv
from geopy.geocoders import Nominatim
from pathlib import Path
from typing import Iterable

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
    "heatwave": _build_aliases(
        "heatwave",
        "ondata di calore",
        "caldo estremo",
    ),
    "coldwave": _build_aliases(
        "coldwave",
        "ondata di gelo",
        "gelo estremo",
    ),
    "drought": _build_aliases(
        "drought",
        "siccita",
        "siccita grave",
    ),
    "blizzard": _build_aliases(
        "blizzard",
        "nevicata eccezionale",
        "bufera di neve",
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

def extract_event_data(article_text: str):
    try:
        system_instruction = """
Sei un sistema di estrazione dati per eventi meteorologici estremi.
Rispondi SEMPRE e SOLO con un oggetto JSON valido. Nessun testo aggiuntivo, nessun markdown.
"""

        prompt = f"""
Analizza il seguente articolo e determina se descrive un evento meteorologico estremo
(alluvione, esondazione, grandine, tempesta, tromba d'aria, nevicata eccezionale,
siccità grave, incendio boschivo, ondata di calore/gelo).

Accetta SOLO notizie di cronaca su un evento realmente accaduto o in corso, con luogo e impatti concreti.
Se il testo è uno studio, un report, un'analisi statistica, una previsione, un commento, una guida,
un riepilogo generale o un articolo economico/assicurativo, rispondi esattamente con: NULL

Se NON è un evento meteo estremo concreto, rispondi esattamente con la parola: NULL

Se lo è, estrai i dati seguendo ESATTAMENTE questo schema JSON:

{{
  "event_type": "uno tra: flood | hail | storm | tornado | wildfire | drought | blizzard | heatwave | coldwave | other",
  "severity": <intero 1-5 dove 1=minore, 5=catastrofico>,

  "geo_area": {{
    "primary_location": "nome città o area principale menzionata",
    "admin_area_level1": "provincia o regione",
    "admin_area_level2": "nazione",
    "centroid_lat": <float, latitudine del centro stimato dell'evento>,
    "centroid_lon": <float, longitudine del centro stimato dell'evento>,
    "radius_km": <float, raggio approssimativo dell'area colpita in km>,
    "affected_places": ["lista", "di", "luoghi", "menzionati"],
    "micro_locations": ["vie", "quartieri", "frazioni", "ponti", "lungofiumi o altre micro-aree"],
    "geometry_geojson": {{
      "type": "Polygon",
      "coordinates": [[[lon, lat], [lon, lat], [lon, lat], [lon, lat], [lon, lat]]]
    }} oppure null
  }},

  "temporal": {{
    "event_date": "YYYY-MM-DD",
    "event_date_confidence": "exact | approximate | inferred",
    "duration_hours": <float o null se non menzionata>
  }},

  "damage": {{
    "description": "descrizione sintetica dei danni in italiano",
    "casualties": <intero o null>,
    "displaced_people": <intero o null>,
    "affected_area_km2": <float o null>
  }},

  "extraction_metadata": {{
    "confidence_score": <float 0.0-1.0>,
    "geo_precision": "exact_city | district | region | approximate",
    "missing_fields": ["lista campi non trovati nell'articolo"]
  }}
}}

Regole per geo_area:
- centroid_lat/lon devono essere le coordinate reali del luogo colpito, non della capitale
- radius_km: 1-5 per evento urbano, 10-50 per evento provinciale, 50-200 per evento regionale
- Se l'articolo menziona più luoghi distanti >50km, usa il centroide geometrico
- Se sono menzionate vie, quartieri, ponti, argini o frazioni, valorizza `micro_locations`
- `geometry_geojson` deve essere valorizzato SOLO se il testo consente di delimitare davvero l'area colpita;
  in quel caso usa un poligono piccolo e plausibile che segua la micro-area citata, non tutta la città
- Se la localizzazione è solo comunale o provinciale, lascia `geometry_geojson: null`

Testo: {article_text}
"""

        # Chiamata con system instruction (Gemini 1.5+)
        response = model.generate_content(
            [system_instruction, prompt],
            generation_config={"temperature": 0.1}  # bassa per output deterministico
        )

        if not response or not response.text:
            return None

        raw = response.text.strip()

        if raw.upper() == "NULL" or "NULL" in raw.upper() and len(raw) < 20:
            return None

        # Pulizia robusta dei markdown fence
        content = raw
        if "```" in content:
            content = content.split("```json")[-1].split("```")[0].strip()
        
        payload = json.loads(content)

        if not isinstance(payload, dict):
            return None

        # Normalizza event_type per compatibilità col resto del sistema
        payload["event_type"] = normalize_event_type(
            payload.get("event_type")
        )

        # Retrocompatibilità: esponi i campi flat che il resto del codice si aspetta
        payload["location"]          = payload.get("geo_area", {}).get("primary_location")
        payload["event_date"]        = payload.get("temporal", {}).get("event_date")
        payload["damage_description"] = payload.get("damage", {}).get("description")
        payload["confidence_score"]   = payload.get("extraction_metadata", {}).get("confidence_score")

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
