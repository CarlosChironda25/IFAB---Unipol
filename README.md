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

<img width="1398" height="758" alt="image" src="https://github.com/user-attachments/assets/fc5e7fbc-fdf3-4897-a6e9-3511ff0f533b" />

## Esecuzione

### Prerequisiti
- Node.js 18+
- Python 3.11+ o compatibile
- una chiave `GEMINI_API_KEY`
- una chiave `BRAVE_SEARCH_API_KEY` consigliata
- opzionale: una chiave `NEWS_API_KEY` come fallback
- opzionale: `VITE_GOOGLE_MAPS_API_KEY` e `VITE_GOOGLE_MAP_ID` per la mappa Google reale

### 1. Avvio backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Crea il file `backend/.env` con almeno:
```env
GEMINI_API_KEY=la_tua_chiave
BRAVE_SEARCH_API_KEY=la_tua_chiave
NEWS_API_KEY=la_tua_chiave
```

Controllo rapido:
```bash
curl http://127.0.0.1:8000/
curl http://127.0.0.1:8000/events
```

### 2. Popolare dati backend
Per generare 1000 clienti fake:
```bash
curl -X POST "http://127.0.0.1:8000/create-test-users?count=1000&reset_existing=true"
```

Per rigenerare gli eventi da zero:
```bash
sqlite3 backend/weather_events.db "DELETE FROM articles; DELETE FROM events;"
curl -X POST "http://127.0.0.1:8000/run-ingestion?max_candidates=12&max_new_events=5"
```

Verifica:
```bash
curl http://127.0.0.1:8000/events
curl http://127.0.0.1:8000/customers
```

### 3. Avvio frontend
```bash
cd frontend
npm install
npm run dev
```

Crea il file `frontend/.env` con:
```env
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_GOOGLE_MAPS_API_KEY=la_tua_chiave_google_maps
VITE_GOOGLE_MAP_ID=il_tuo_map_id
```

Apri:
```text
http://127.0.0.1:5173
```

### 4. Esecuzione completa
Usa due terminali:
- terminale 1: backend su `127.0.0.1:8000`
- terminale 2: frontend su `127.0.0.1:5173`

Il frontend usa il backend reale se `VITE_API_BASE_URL` è configurata. In caso contrario usa i mock locali.

## Note Operative
- La pipeline eventi usa Brave Search come sorgente primaria e NewsAPI come fallback, filtrando poi articoli ANSA e cronaca concreta.
- Gli eventi troppo vaghi dal punto di vista geografico vengono scartati.
- I clienti e i periti sono ancora in parte mock, a seconda degli endpoint backend disponibili.
