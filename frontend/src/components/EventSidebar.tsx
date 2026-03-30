import type { DisasterEvent } from '../types/event';
import { EventCard } from './EventCard';
import { EventDetails } from './EventDetails';

interface EventSidebarProps {
  events: DisasterEvent[];
  selectedEventId: string | null;
  onSelect: (eventId: string) => void;
}

/*
Il componente EventSidebar è responsabile di visualizzare la lista degli eventi filtrati e i dettagli dell'evento selezionato. Riceve tre props:
- events: un array di DisasterEvent da visualizzare nella lista.
- selectedEventId: l'ID dell'evento attualmente selezionato, o null se nessun evento è selezionato.
- onSelect: una funzione callback che viene chiamata quando l'utente seleziona un evento dalla lista, passando l'ID dell'evento selezionato.

Il componente è diviso in due sezioni principali:
1. La lista degli eventi, che mostra un riepilogo di ciascun evento e consente all'utente di selezionarne uno.
2. I dettagli dell'evento selezionato, che mostrano informazioni più approfondite sull'evento attivo.

Se non ci sono eventi da visualizzare, viene mostrato uno stato vuoto con un messaggio informativo.
*/

export function EventSidebar({ events, selectedEventId, onSelect }: EventSidebarProps) {
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null;

  return (
    <aside className="event-sidebar">
      <section className="event-sidebar__list">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Evento feed</span>
            <h2>Eventi filtrati</h2>
          </div>
          <span>{events.length}</span>
        </div>

        <div className="event-list">
          {events.length ? (
            events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                isSelected={event.id === selectedEventId}
                onSelect={onSelect}
              />
            ))
          ) : (
            <div className="empty-state">
              <h3>Nessun evento compatibile</h3>
              <p>Allarga i filtri o attendi il prossimo ciclo di polling del backend.</p>
            </div>
          )}
        </div>
      </section>

      <EventDetails event={selectedEvent} />
    </aside>
  );
}
