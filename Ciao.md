Riassunto generale del progetto

L’idea è costruire una piattaforma che monitora fonti aperte di notizie su eventi climatici estremi, estrae dai testi informazioni strutturate tramite Gemini, geolocalizza gli eventi e li visualizza su una mappa interattiva.

Il flusso logico è questo:

Il backend recupera articoli da NewsAPI o da fonti selezionate tramite scraping.
Ogni articolo viene analizzato da Gemini, che restituisce un JSON con campi come tipo di evento, data, luoghi menzionati, località principale, indicatori di danno e livello di confidenza.
I luoghi estratti vengono convertiti in coordinate o aree geografiche tramite geocoding.
Il sistema confronta il nuovo articolo con gli eventi già presenti nel database:
se è probabilmente lo stesso evento, aggiorna quello esistente;
se non lo è, crea un nuovo evento.
Il frontend mostra gli eventi consolidati su una mappa Google Maps, con marker o aree GeoJSON, pannello laterale, filtri e dettagli. L’API Maps JavaScript supporta sia marker avanzati sia Data Layer per GeoJSON.

La parte davvero importante non è “mostrare news”, ma trasformare molte news in pochi eventi consolidati e leggibili.

Come ragionare sull’architettura
Backend

Il backend deve fare cinque cose:

ingestion delle news
parsing con Gemini
geocoding
deduplica articoli
event consolidation

Per l’MVP, Python con FastAPI va benissimo. SQLite va bene per iniziare, poi potete passare a PostgreSQL se il progetto cresce.

Database

Ti servono almeno tre tabelle logiche:

articles

Serve per salvare gli articoli grezzi:

id
titolo
url
fonte
testo
published_at
content_hash
created_at
events

Serve per salvare l’evento consolidato:

id
event_type
title
main_location
latitude
longitude
geometry_geojson
start_date
last_update
severity
confidence
sources_count
status
article_event_links

Serve per dire quale articolo è stato collegato a quale evento:

id
article_id
event_id
match_score
created_at
Come funziona il matching

Quando arriva un nuovo articolo:

controlli se l’articolo è già noto, usando URL o hash del contenuto;
se è nuovo, lo analizzi con Gemini;
estrai tipo evento, luogo, data e altri dati;
confronti il risultato con gli eventi già esistenti.

Il match_score è un numero che misura quanto il nuovo articolo assomiglia a un evento già presente. Un modo semplice per l’MVP è assegnare punti per:

stesso tipo di evento
vicinanza geografica
vicinanza temporale
similarità testuale del titolo o del riassunto

Esempio:

stesso tipo evento: +40
distanza < 10 km: +30
distanza temporale < 24h: +20
titolo simile: +10

Totale massimo: 100.

Poi imposti una soglia:

>= 70: aggiorna evento esistente
< 70: crea nuovo evento

Questo non è perfetto, ma per un MVP è chiaro, spiegabile e implementabile.

Uso di GeoJSON

Qui i tutor ti hanno dato un buon consiglio.

GeoJSON è un formato standard per rappresentare dati geografici. Google Maps JavaScript API può mostrare GeoJSON tramite il Data Layer, che accetta punti, linee e poligoni.

Quindi io farei così:

nel database salvi l’evento anche in forma normale (lat, lng)
opzionalmente salvi anche geometry_geojson
il frontend usa:
marker per eventi puntuali
GeoJSON per aree colpite, se disponibili

Questo è utile perché:

separi i dati geografici dal rendering;
puoi passare facilmente backend → frontend;
sei già pronto se in futuro vuoi passare da “punto” ad “area impattata”.
Frontend: cosa farei io

Qui vado sul concreto.

Stack frontend consigliato
React
TypeScript
Vite
Google Maps JavaScript API
eventualmente @googlemaps/markerclusterer se avete molti marker

Google consiglia TypeScript ufficialmente per Maps JS e fornisce tipi e guida dedicata. Inoltre, per mappe con molti marker, c’è il marker clustering ufficiale.

Scelta Google Maps: cosa usare davvero

Per il vostro caso userei tre cose:

1. Google Maps JavaScript API

È la base della mappa. Supporta mappe 2D/3D, marker personalizzati, layer dati e controlli.

2. AdvancedMarkerElement

Per i marker evento. google.maps.Marker è deprecato dal 21 febbraio 2024; Google raccomanda di usare google.maps.marker.AdvancedMarkerElement.

3. Data Layer

Per importare e visualizzare GeoJSON, soprattutto se vuoi mostrare aree colpite e non solo punti. Ogni Map ha già un oggetto Data disponibile.

Come strutturerei il frontend
Layout

Farei una UI a due colonne:

Sinistra

La mappa Google Maps:

marker degli eventi
eventuali poligoni/aree GeoJSON
clustering marker se gli eventi sono tanti
click sui marker per selezionare un evento
Destra

Pannello laterale:

lista eventi
filtri
dettaglio dell’evento selezionato
fonti collegate
confidence
severità
date
tipo evento

Questo è più utile di una semplice infowindow, perché ti permette di far vedere anche tutte le news collegate.

Pagine e componenti frontend

Io lo darei a Codex così.

Pagina principale

DashboardPage.tsx

Contiene:

barra filtri in alto
mappa a sinistra
sidebar a destra
Componenti
MapView.tsx

Responsabile della mappa Google Maps:

inizializza la mappa
carica i marker
carica il GeoJSON
gestisce click e selezione
EventSidebar.tsx

Mostra:

elenco eventi filtrati
dettagli evento selezionato
FilterBar.tsx

Filtri per:

tipo evento
data
area geografica
severità
stato evento
EventCard.tsx

Card nella sidebar con:

titolo
tipo evento
luogo
data
confidence
numero fonti
EventDetails.tsx

Dettaglio completo:

descrizione sintetica
proprietà principali
fonti associate
GeoJSON se disponibile
eventuali metriche
Modello dati frontend in TypeScript

Questo è importante da dare a Codex.

export type EventType =
  | "flood"
  | "storm"
  | "hail"
  | "earthquake"
  | "wildfire"
  | "unknown";

export interface Article {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  snippet?: string;
}

export interface EventGeometry {
  type: "Point" | "Polygon" | "MultiPolygon";
  coordinates: any;
}

export interface DisasterEvent {
  id: string;
  title: string;
  eventType: EventType;
  mainLocation: string;
  latitude?: number;
  longitude?: number;
  geometryGeoJson?: EventGeometry;
  startDate?: string;
  lastUpdate?: string;
  severity?: number;
  confidence?: number;
  sourcesCount: number;
  status: "new" | "updated" | "confirmed";
  articles: Article[];
}
Come caricare Google Maps in React + TypeScript

Google oggi documenta tre modi per caricare la Maps JavaScript API, incluso il Dynamic Library Import e il package NPM js-api-loader.

Per un progetto React + Vite + TypeScript, io ti consiglio questa linea:

caricare l’API una sola volta in un hook dedicato;
importare le librerie che servono (maps, marker);
usare AdvancedMarkerElement per i marker;
usare map.data per il GeoJSON.

Inoltre, per gli advanced markers, Google richiede il caricamento della libreria marker; la documentazione “Get started with advanced markers” indica anche l’uso di un mapId.

Logica frontend consigliata
1. Al mount della pagina
chiami GET /events
ottieni lista eventi consolidati
salvi tutto nello stato globale o locale
2. Inizializzazione mappa
centri la mappa sull’Italia
zoom iniziale medio
carichi marker puntuali
carichi GeoJSON aree impattate, se presenti
3. Interazione
click su marker → selezioni evento
click su card sidebar → centri mappa su evento
filtri → aggiorni sia lista sia marker
4. Auto-refresh
polling ogni 30–60 secondi
aggiorni eventi senza ricaricare la pagina
Funzioni frontend che chiederei a Codex
Mappa
mostrare marker evento
marker cliccabili
marker colorati per tipo evento
clustering opzionale
fit bounds sugli eventi visibili
Sidebar
elenco ordinato per data o severità
dettaglio evento selezionato
fonti cliccabili
badge confidence e stato
Filtri
per tipo evento
per intervallo date
per confidence minima
per severità minima
GeoJSON
caricare poligoni da geometryGeoJson
stile diverso per evento selezionato
supporto a Point e Polygon
Come userei Google Maps, in pratica
Marker

Usa AdvancedMarkerElement, non il marker legacy. Google lo raccomanda esplicitamente perché google.maps.Marker è deprecato.

GeoJSON

Usa map.data.addGeoJson(...) oppure map.data.loadGeoJson(...) per caricare i dati. Google documenta entrambe le possibilità attraverso il Data Layer e gli esempi ufficiali.

Clustering

Se avete molti eventi, usa @googlemaps/markerclusterer. È la libreria ufficiale consigliata per clusterizzare marker vicini.

Struttura cartelle frontend
src/
  api/
    events.ts
  components/
    FilterBar.tsx
    EventCard.tsx
    EventDetails.tsx
    EventSidebar.tsx
    MapView.tsx
  hooks/
    useGoogleMap.ts
    useEvents.ts
  pages/
    DashboardPage.tsx
  types/
    event.ts
  utils/
    eventColors.ts
    geojson.ts
    mapBounds.ts
  App.tsx
  main.tsx
Specifica pronta da dare a Codex

Puoi incollargli qualcosa del genere.

Crea un frontend React + TypeScript + Vite per una piattaforma di monitoraggio eventi climatici estremi.

Requisiti:
- usare Google Maps JavaScript API
- usare AdvancedMarkerElement per i marker
- usare Data Layer o supporto equivalente per visualizzare GeoJSON
- layout a due colonne: mappa a sinistra, sidebar a destra
- filtri per tipo evento, data, severità, confidence
- click su marker o su card sidebar seleziona l’evento
- evento selezionato evidenziato in mappa e mostrato nella sidebar
- supportare polling periodico di GET /events
- supportare marker clustering se gli eventi sono tanti
- usare TypeScript con tipi forti

API di backend attesa:
GET /events

Risposta:
[
  {
    "id": "evt_1",
    "title": "Alluvione a Bologna Sud",
    "eventType": "flood",
    "mainLocation": "Bologna",
    "latitude": 44.4949,
    "longitude": 11.3426,
    "geometryGeoJson": null,
    "startDate": "2026-03-30T09:00:00Z",
    "lastUpdate": "2026-03-30T10:00:00Z",
    "severity": 0.82,
    "confidence": 0.9,
    "sourcesCount": 3,
    "status": "confirmed",
    "articles": [
      {
        "id": "art_1",
        "title": "Forti allagamenti a Bologna Sud",
        "url": "https://example.com/article1",
        "source": "ANSA",
        "publishedAt": "2026-03-30T09:10:00Z"
      }
    ]
  }
]

Componenti richiesti:
- DashboardPage
- MapView
- EventSidebar
- EventCard
- EventDetails
- FilterBar

Note:
- inizializzare la mappa centrata sull’Italia
- usare colori diversi per i tipi evento
- se geometryGeoJson è presente, renderizzarlo sulla mappa
- se latitude/longitude sono presenti, creare un marker
- usare uno stato centralizzato semplice con React hooks
Una nota critica finale

Google Maps va benissimo se:

vuoi una demo molto pulita;
ti interessa una UX familiare;
vuoi componenti maturi.

Però c’è un costo/chiave API/billing da gestire. Google richiede una API key per la Maps JavaScript API e documenta sia la configurazione della chiave sia il billing.

Quindi per la challenge è una buona scelta, ma fate attenzione a:

mettere la chiave in env;
limitare il referrer;
non hardcodarla nel repo.