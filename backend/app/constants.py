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

PRECISE_PLACE_TYPES = {
    "route",
    "street_address",
    "premise",
    "subpremise",
    "point_of_interest",
    "establishment",
    "tourist_attraction",
    "neighborhood",
    "sublocality",
    "sublocality_level_1",
    "natural_feature",
}
