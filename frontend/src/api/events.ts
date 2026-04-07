import { mockEvents } from '../mocks/events';
import type { DisasterEvent } from '../types/event';
import { eventTypeLabels } from '../utils/eventColors';

/* Questo modulo simula una chiamata API per ottenere eventi climatici estremi. In un'applicazione reale, questa funzione farebbe una richiesta HTTP a un backend
Per questa demo, restituisce un set di dati statico dopo un breve ritardo per simulare la latenza di rete.
La funzione accetta un AbortSignal per consentire l'annullamento della richiesta, ad esempio se l'utente cambia pagina o aggiorna i filtri prima che la risposta arrivi.
Se la richiesta viene annullata, la funzione rigetta con un DOMException di tipo 'AbortError'.
*/

interface BackendArticle {
  id: number;
  title?: string | null;
  url?: string | null;
  source?: string | null;
  published_at?: string | null;
  content?: string | null;
}

interface BackendEvent {
  id: number;
  event_type?: DisasterEvent['eventType'] | null;
  main_location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geometry_geojson?: DisasterEvent['geometryGeoJson'] | null;
  start_date?: string | null;
  last_update?: string | null;
  confidence_score?: number | null;
  status?: DisasterEvent['status'] | null;
  impact_radius_km?: number | null;
  coordinate_source?: string | null;
  articles?: BackendArticle[] | null;
}

function normalizeEventType(eventType?: string | null): DisasterEvent['eventType'] {
  const normalized = eventType?.trim().toLowerCase();

  if (
    normalized === 'flood' ||
    normalized === 'storm' ||
    normalized === 'hail' ||
    normalized === 'tornado' ||
    normalized === 'earthquake' ||
    normalized === 'wildfire' ||
    normalized === 'drought' ||
    normalized === 'blizzard' ||
    normalized === 'heatwave' ||
    normalized === 'coldwave'
  ) {
    return normalized;
  }

  if (normalized === 'alluvione' || normalized === 'allagamento' || normalized === 'esondazione' || normalized === 'nubifragio' || normalized === "bomba d'acqua") {
    return 'flood';
  }

  if (normalized === 'grandine' || normalized === 'grandinata' || normalized === 'hailstorm') {
    return 'hail';
  }

  if (normalized === 'tornado' || normalized === "tromba d'aria") {
    return 'tornado';
  }

  if (
    normalized === 'tempesta' ||
    normalized === 'temporale' ||
    normalized === 'maltempo' ||
    normalized === 'windstorm' ||
    normalized === 'thunderstorm' ||
    normalized === 'vento'
  ) {
    return 'storm';
  }

  if (normalized === 'incendio' || normalized === 'incendio boschivo' || normalized === 'rogo') {
    return 'wildfire';
  }

  if (normalized === 'terremoto' || normalized === 'sisma' || normalized === 'scossa') {
    return 'earthquake';
  }

  if (normalized === 'siccita' || normalized === 'siccita grave') {
    return 'drought';
  }

  if (normalized === 'nevicata eccezionale' || normalized === 'bufera di neve') {
    return 'blizzard';
  }

  if (normalized === 'ondata di calore' || normalized === 'caldo estremo') {
    return 'heatwave';
  }

  if (normalized === 'ondata di gelo' || normalized === 'gelo estremo') {
    return 'coldwave';
  }

  return 'unknown';
}

function mapBackendEvent(event: BackendEvent): DisasterEvent {
  const eventType = normalizeEventType(event.event_type);
  const mainLocation = event.main_location ?? 'Localita non disponibile';
  const articles = (event.articles ?? []).map((article) => ({
    id: String(article.id),
    title: article.title ?? 'Articolo senza titolo',
    url: article.url ?? '#',
    source: article.source ?? 'Fonte non disponibile',
    publishedAt: article.published_at ?? new Date().toISOString(),
    snippet: article.content?.slice(0, 220),
  }));

  return {
    id: String(event.id),
    title: `${eventTypeLabels[eventType]} a ${mainLocation}`,
    eventType,
    mainLocation,
    latitude: event.latitude ?? null,
    longitude: event.longitude ?? null,
    geometryGeoJson: event.geometry_geojson ?? null,
    startDate: event.start_date ?? null,
    lastUpdate: event.last_update ?? event.start_date ?? null,
    severity: Math.max(0.35, Math.min(0.95, event.confidence_score ?? 0.55)),
    confidence: event.confidence_score ?? 0.55,
    impactRadiusKm: event.impact_radius_km ?? null,
    sourcesCount: articles.length,
    status: event.status === 'updated' || event.status === 'confirmed' ? event.status : 'new',
    articles,
  };
}

async function getEventsFromBackend(signal?: AbortSignal): Promise<DisasterEvent[]> {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  if (!apiBaseUrl) {
    throw new Error('API base URL non configurata.');
  }

  const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/events`, { signal });
  if (!response.ok) {
    throw new Error(`Backend events non disponibile (${response.status}).`);
  }

  const payload = (await response.json()) as BackendEvent[];
  return payload.map(mapBackendEvent);
}

export async function getEvents(signal?: AbortSignal): Promise<DisasterEvent[]> {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

  if (apiBaseUrl) {
    return getEventsFromBackend(signal);
  }

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      if (signal?.aborted) {
        reject(new DOMException('Richiesta annullata.', 'AbortError'));
        return;
      }

      resolve(mockEvents);
    }, 250);

    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeoutId);
        reject(new DOMException('Richiesta annullata.', 'AbortError'));
      },
      { once: true }
    );
  });
}
