import type { DisasterEvent } from '../types/event';
import { eventStatusLabels, eventTypeLabels } from '../utils/eventColors';

interface EventDetailsProps {
  event: DisasterEvent | null;
}

function formatDate(date?: string | null): string {
  if (!date) {
    return 'Non disponibile';
  }

  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(date));
}

/*
Il componente EventDetails mostra informazioni dettagliate su un evento climatico estremo selezionato. Se non viene selezionato alcun evento, mostra un messaggio di invito a selezionare un evento.
Quando un evento è selezionato, vengono visualizzati titolo, località, tipo, stato, severità, confidence, date di inizio e ultimo aggiornamento, coordinate (se disponibili), tipo di geometria (se disponibile) e una lista di fonti collegate con titolo, fonte, data di pubblicazione e snippet.
I dati sono formattati in modo leggibile e organizzati in sezioni per facilitare la consultazione da parte dell'utente.
*/

export function EventDetails({ event }: EventDetailsProps) {
  if (!event) {
    return (
      <section className="event-details event-details--empty">
        <span className="eyebrow">Selezione evento</span>
        <h3>Nessun evento selezionato</h3>
        <p>Scegli un marker o una card per vedere fonti collegate, metriche e geometria disponibile.</p>
      </section>
    );
  }

  return (
    <section className="event-details">
      <span className="eyebrow">Evento consolidato</span>
      <h3>{event.title}</h3>
      <p className="event-details__location">{event.mainLocation}</p>

      <div className="detail-metrics">
        <article>
          <span>Tipo</span>
          <strong>{eventTypeLabels[event.eventType]}</strong>
        </article>
        <article>
          <span>Stato</span>
          <strong>{eventStatusLabels[event.status]}</strong>
        </article>
        <article>
          <span>Severità</span>
          <strong>{Math.round((event.severity ?? 0) * 100)}%</strong>
        </article>
        <article>
          <span>Confidence</span>
          <strong>{Math.round((event.confidence ?? 0) * 100)}%</strong>
        </article>
      </div>

      <dl className="event-details__meta">
        <div>
          <dt>Data inizio</dt>
          <dd>{formatDate(event.startDate)}</dd>
        </div>
        <div>
          <dt>Ultimo aggiornamento</dt>
          <dd>{formatDate(event.lastUpdate)}</dd>
        </div>
        <div>
          <dt>Coordinate</dt>
          <dd>
            {typeof event.latitude === 'number' && typeof event.longitude === 'number'
              ? `${event.latitude.toFixed(4)}, ${event.longitude.toFixed(4)}`
              : 'Non disponibili'}
          </dd>
        </div>
        <div>
          <dt>GeoJSON</dt>
          <dd>{event.geometryGeoJson ? event.geometryGeoJson.type : 'Assente'}</dd>
        </div>
      </dl>

      <div className="event-details__sources">
        <div className="section-heading">
          <h4>Fonti collegate</h4>
          <span>{event.articles.length} articoli</span>
        </div>

        {event.articles.map((article) => (
          <a
            key={article.id}
            className="article-link"
            href={article.url}
            target="_blank"
            rel="noreferrer"
          >
            <strong>{article.title}</strong>
            <span>
              {article.source} · {formatDate(article.publishedAt)}
            </span>
            {article.snippet ? <p>{article.snippet}</p> : null}
          </a>
        ))}
      </div>
    </section>
  );
}
