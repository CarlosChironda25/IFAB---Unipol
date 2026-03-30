import type { EventFilters, EventStatus, EventType } from '../types/event';
import { eventStatusLabels, eventTypeLabels } from '../utils/eventColors';

interface FilterBarProps {
  filters: EventFilters;
  onChange: (nextFilters: EventFilters) => void;
}

const eventTypes: Array<EventType | 'all'> = ['all', 'flood', 'storm', 'hail', 'earthquake', 'wildfire', 'unknown'];
const eventStatuses: Array<EventStatus | 'all'> = ['all', 'new', 'updated', 'confirmed'];

/*
Il componente FilterBar è responsabile di visualizzare i controlli per filtrare gli eventi climatici estremi. Riceve due props:
- filters: un oggetto che rappresenta lo stato attuale dei filtri applicati.
- onChange: una funzione callback che viene chiamata ogni volta che l'utente modifica uno dei filtri, passando il nuovo stato dei filtri.

Il componente include controlli per:
- Ricerca testuale (input di tipo search)
- Selezione del tipo di evento (select)
- Selezione dello stato dell'evento (select)
- Intervallo di date (input di tipo date)
- Severità minima (input di tipo range)
- Confidence minima (input di tipo range)

Ogni volta che l'utente modifica un filtro, viene chiamata la funzione update, che costruisce un nuovo oggetto di filtri combinando lo stato attuale con la modifica specifica, e lo passa alla callback onChange.
*/

export function FilterBar({ filters, onChange }: FilterBarProps) {
  const update = <K extends keyof EventFilters>(key: K, value: EventFilters[K]) => {
    onChange({
      ...filters,
      [key]: value,
    });
  };

  return (
    <section className="filter-bar">
      <div className="filter-bar__heading">
        <span className="eyebrow">Controlli live</span>
        <h2>Filtri operativi</h2>
      </div>

      <div className="filter-grid">
        <label>
          Ricerca
          <input
            type="search"
            value={filters.search}
            placeholder="Bologna, grandine, incendio..."
            onChange={(event) => update('search', event.target.value)}
          />
        </label>

        <label>
          Tipo evento
          <select
            value={filters.eventType}
            onChange={(event) => update('eventType', event.target.value as EventType | 'all')}
          >
            {eventTypes.map((eventType) => (
              <option key={eventType} value={eventType}>
                {eventType === 'all' ? 'Tutti i tipi' : eventTypeLabels[eventType]}
              </option>
            ))}
          </select>
        </label>

        <label>
          Stato
          <select
            value={filters.status}
            onChange={(event) => update('status', event.target.value as EventStatus | 'all')}
          >
            {eventStatuses.map((status) => (
              <option key={status} value={status}>
                {status === 'all' ? 'Tutti gli stati' : eventStatusLabels[status]}
              </option>
            ))}
          </select>
        </label>

        <label>
          Dal
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(event) => update('dateFrom', event.target.value)}
          />
        </label>

        <label>
          Al
          <input
            type="date"
            value={filters.dateTo}
            onChange={(event) => update('dateTo', event.target.value)}
          />
        </label>

        <label>
          Severita minima
          <div className="filter-range">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={filters.minSeverity}
              onChange={(event) => update('minSeverity', Number(event.target.value))}
            />
            <span>{Math.round(filters.minSeverity * 100)}%</span>
          </div>
        </label>

        <label>
          Confidence minima
          <div className="filter-range">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={filters.minConfidence}
              onChange={(event) => update('minConfidence', Number(event.target.value))}
            />
            <span>{Math.round(filters.minConfidence * 100)}%</span>
          </div>
        </label>
      </div>
    </section>
  );
}
