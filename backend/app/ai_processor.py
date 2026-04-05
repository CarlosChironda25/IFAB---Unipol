import google.generativeai as genai
import os
import json
from dotenv import load_dotenv
from geopy.geocoders import Nominatim
from pathlib import Path

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
model = genai.GenerativeModel('models/gemini-2.0-flash-001')

def extract_event_data(article_text: str):
    try:
        response = model.generate_content(
            f"Analizza e rispondi in JSON: {article_text}"
        )
        prompt = f"""
          Analizza il seguente articolo di cronaca su un evento meteorologico estremo.
          Estrai la data dell'evento menzionata nel testo. Se non presente, usa la data odierna.
          Identifica il tipo di evento (es. alluvione, grandine, tempesta, tromba d'aria, esondazione, incendio).
          Estrai i dati in formato JSON seguendo esattamente questo schema:
        {{
            "event_type": "tipo evento",
            "location": "città",
            "event_date": "YYYY-MM-DD",
            "damage_description": "danni",
            "confidence_score": 0.9
        }}
        Se non è un evento meteo estremo, rispondi NULL.
        
        Testo: {article_text}
        """
        
        # Chiamata standard
        response = model.generate_content(prompt)
        
        if not response or not response.text or "NULL" in response.text:
            return None
            
        # Pulizia testo
        content = response.text.replace("```json", "").replace("```", "").strip()
        return json.loads(content)
        
    except Exception as e:
        print(f"ERRORE AI: {e}")
        return None

# Geocoding
geolocator = Nominatim(user_agent="weather_platform_ifab")

def get_coordinates(location_name: str):
    if not location_name: return None, None
    try:
        # Puliamo la stringa se Gemini restituisce descrizioni lunghe
        clean_loc = location_name.split('(')[0].strip() 
        location = geolocator.geocode(f"{clean_loc}, Italia", timeout=10)
        return (location.latitude, location.longitude) if location else (None, None)
    except:
        return None, None