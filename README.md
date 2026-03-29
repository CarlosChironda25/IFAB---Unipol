# IFAB---Unipol
Questa piattaforma nasce per supportare le compagnie assicurative nel monitoraggio in tempo reale degli eventi climatici estremi. Il sistema permette di mappare con precisione le aree colpite da alluvioni, tempeste o grandinate, facilitando l'intervento tempestivo dei periti.

Se la mappa identifica aree di danno corrispondenti alla posizione dei clienti con una polizza attiva, l'assicurazione può:

Anticipare l'apertura dei sinistri prima ancora della segnalazione del cliente.

Ottimizzare la logistica dei periti sul territorio in base all'intensità dell'evento.

Ridurre le frodi verificando la coerenza tra il danno dichiarato e i dati geospaziali validati dall'AI.

**Key Features**
Data Ingestion: Recupero automatico di news da fonti aperte e scraping locale.

AI Analysis: Estrazione di dati strutturati (luogo, data, entità del danno) tramite Gemini API.

Event Consolidation: Algoritmo di deduplicazione per unire più fonti in un unico "Evento Consolidato".

Interactive Map: Visualizzazione GeoJSON per il filtraggio spaziale dei sinistri.

Struttura del Progetto
IFAB---Unipol
├── backend/
│   ├── app/
│   │   ├── main.py          # Entry point FastAPI
│   │   ├── scraper.py       # Logica NewsAPI/Scraping
│   │   ├── ai_processor.py  # Integrazione Gemini
│   │   ├── database.py      # Configurazione SQLite/SQLAlchemy
│   │   └── models.py        # Schemi Pydantic e Tabelle DB
│   ├── requirements.txt
│   └── .env                 # API Keys (Gemini, NewsAPI)
├── frontend/
│   ├── src/
│   │   ├── components/      # Mappa e Sidebar
│   │   └── App.js
│   ├── package.json
└── README.md



