from math import radians, cos, sin, asin, sqrt
from datetime import timedelta
import difflib

def haversine_distance(lat1, lon1, lat2, lon2):
    """Calcola la distanza in KM tra due coordinate geografiche."""
    R = 6371 # Raggio della Terra in km
    dLat = radians(lat2 - lat1)
    dLon = radians(lon2 - lon1)
    a = sin(dLat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dLon/2)**2
    return 2 * R * asin(sqrt(a))

def calculate_event_score(new_data, existing_event, new_lat, new_lon):
    """
    Calcola lo Score di Matching (0-100) tra una news e un evento a sistema.
    Pesi: Tipo (30%), Geo (40%), Tempo (20%), Testo (10%)
    """
    score = 0
    
    # 1. S_tipo (Peso 30%)
    if new_data['event_type'].lower() in existing_event.event_type.lower() or \
       existing_event.event_type.lower() in new_data['event_type'].lower():
        score += 30
        
    # 2. S_geo (Peso 40%) - Raggio di 50km
    dist = haversine_distance(new_lat, new_lon, existing_event.latitude, existing_event.longitude)
    if dist <= 10:
        score += 40 # Vicinissimi
    elif dist <= 50:
        score += 20 # Area regionale
        
    # 3. S_tempo (Peso 20%) - Finestra di 48 ore
    # Assumiamo che existing_event.start_date sia un oggetto datetime
    time_diff = abs((existing_event.start_date.date() - new_data['event_date_obj'].date()).days)
    if time_diff == 0:
        score += 20
    elif time_diff <= 2:
        score += 10
        
    # 4. S_testo (Peso 10%) - Similarità tra descrizioni danni
    # Usiamo difflib per confrontare le stringhe
    text_sim = difflib.SequenceMatcher(None, new_data['damage_description'], 
                                     existing_event.damage_info.get('description', '')).ratio()
    score += (text_sim * 10)
    
    return score