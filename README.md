# IFAB---Unipol
Questa piattaforma nasce per supportare le compagnie assicurative nel monitoraggio in tempo reale degli eventi climatici estremi. Il sistema permette di mappare con precisione le aree colpite da alluvioni, tempeste o grandinate, facilitando l'intervento tempestivo dei periti.

Se la mappa identifica aree di danno corrispondenti alla posizione dei clienti con una polizza attiva, l'assicurazione può:

Anticipare l'apertura dei sinistri prima ancora della segnalazione del cliente.

Ottimizzare la logistica dei periti sul territorio in base all'intensità dell'evento.

Ridurre le frodi verificando la coerenza tra il danno dichiarato e i dati geospaziali validati dall'AI.

## Key Features
Data Ingestion: Recupero automatico di news da fonti aperte e scraping locale.

AI Analysis: Estrazione di dati strutturati (luogo, data, entità del danno) tramite Gemini API.

Event Consolidation: Algoritmo di deduplicazione per unire più fonti in un unico "Evento Consolidato".

Interactive Map: Visualizzazione GeoJSON per il filtraggio spaziale dei sinistri.

## Struttura del Progetto
IFAB---Unipol/
├── backend/                # Logica server e elaborazione dati
│   ├── app/
│   │   ├── main.py         # Entry point FastAPI e rotte API
│   │   ├── scraper.py      # Modulo di raccolta dati (NewsAPI/Scraping)
│   │   ├── ai_processor.py # Integrazione con LLM Gemini per analisi testuale
│   │   ├── database.py     # Gestione connessione SQLite e SQLAlchemy
│   │   └── models.py       # Definizione tabelle DB e schemi Pydantic
│   ├── requirements.txt    # Dipendenze Python
│   └── .env                # Variabili d'ambiente (API Keys)
├── frontend/               # Interfaccia Utente (Dashboard)
│   ├── src/
│   │   ├── components/     # Componenti React (Mappa Leaflet, Sidebar)
│   │   └── App.js          # Logica principale del frontend
│   └── package.json        # Dipendenze Node.js
└── README.md               # Documentazione del progetto

