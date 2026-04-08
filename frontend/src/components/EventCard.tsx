import type { CSSProperties } from 'react';
import type { DisasterEvent } from '../types/event';
import { eventStatusLabels, eventTypeColors, eventTypeLabels } from '../utils/eventColors';

interface EventCardProps {
  event: DisasterEvent;
  isSelected: boolean;
  onSelect: (eventId: string) => void;
}

function formatDate(date?: string | null): string {
  if (!date) {
    return 'Data non disponibile';
  }

  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date));
}

/*
Il componente EventCard rappresenta una scheda riassuntiva per un evento climatico estremo. Mostra informazioni chiave come titolo, località, data di inizio, numero di fonti, severità e confidence.
La scheda è cliccabile e consente di selezionare un evento, evidenziando la scheda selezionata. I colori e le etichette sono basati sul tipo e lo stato dell'evento, utilizzando stili CSS personalizzati.
*/

export function EventCard({ event, isSelected, onSelect }: EventCardProps) {
  return (
    <button
      type="button"
      className={`event-card ${isSelected ? 'event-card--selected' : ''}`}
      onClick={() => onSelect(event.id)}
      style={{ '--event-color': eventTypeColors[event.eventType] } as CSSProperties}
    >
      <div className="event-card__topline">
        <span className="event-pill">{eventTypeLabels[event.eventType]}</span>
        <span className="event-pill event-pill--ghost">{eventStatusLabels[event.status]}</span>
      </div>

      <h3>{event.title}</h3>
      <p>{event.mainLocation}</p>

      <dl>
        <div>
          <dt>Prima fonte</dt>
          <dd>{formatDate(event.startDate)}</dd>
        </div>
        <div>
          <dt>Fonti</dt>
          <dd>{event.sourcesCount}</dd>
        </div>
        <div>
          <dt>Severità</dt>
          <dd>{Math.round((event.severity ?? 0) * 100)}%</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>{Math.round((event.confidence ?? 0) * 100)}%</dd>
        </div>
      </dl>
    </button>
  );
}
