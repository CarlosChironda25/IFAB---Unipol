import type { MapLayerMode } from '../../types/exposure';
import type { DisasterEvent } from '../../types/event';
import { assetTypeLabels, impactColors, vulnerabilityColors, vulnerabilityLabels } from '../../utils/customerMeta';
import { eventTypeColors, eventTypeLabels } from '../../utils/eventColors';
import { MapModeSwitch } from './MapModeSwitch';

/*
OperationalMapControls raccoglie i controlli della mappa.
Mostra il cambio modalita, il focus evento e la legenda contestuale in base al layer selezionato.
*/

interface OperationalMapControlsProps {
  mode: MapLayerMode;
  events: DisasterEvent[];
  focusedEventId: string | null;
  onModeChange: (mode: MapLayerMode) => void;
  onFocusedEventChange: (eventId: string | null) => void;
}

export function OperationalMapControls({
  mode,
  events,
  focusedEventId,
  onModeChange,
  onFocusedEventChange,
}: OperationalMapControlsProps) {
  const visibleEventTypes = Array.from(new Set(events.map((event) => event.eventType)));
  const legendTitle =
    mode === 'event'
      ? 'Legenda evento climatico'
      : mode === 'customers'
        ? 'Legenda clienti nel territorio'
        : 'Legenda layer combinato';

  return (
    <div className="map-controls">
      <div className="map-controls__header">
        <div>
          <span className="eyebrow">Scenario geospaziale</span>
          <h2>Mappa operativa eventi e clienti</h2>
        </div>
        <MapModeSwitch mode={mode} onChange={onModeChange} />
      </div>

      <div className="map-controls__grid">
        <label>
          Evento focus
          <select value={focusedEventId ?? 'all'} onChange={(event) => onFocusedEventChange(event.target.value === 'all' ? null : event.target.value)}>
            <option value="all">Tutti gli eventi filtrati</option>
            {events.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title}
              </option>
            ))}
          </select>
        </label>

        <div className="map-legend">
          <span className="map-legend__title">{legendTitle}</span>
          {mode === 'event' ? (
            <>
              {visibleEventTypes.map((eventType) => (
                <span key={eventType} className="map-legend__item">
                  <span className="map-legend__dot" style={{ background: eventTypeColors[eventType] }} />
                  {eventTypeLabels[eventType]}: marker e perimetro dell'evento.
                </span>
              ))}
              <span className="map-legend__item">
                <span className="map-legend__dot map-legend__dot--outline" style={{ background: 'rgba(19, 34, 56, 0.15)' }} />
                Poligono o area evidenziata: stima del territorio colpito o del perimetro operativo.
              </span>
            </>
          ) : null}
          {mode === 'customers' ? (
            <>
              <span className="map-legend__item">
                <span className="map-legend__dot" style={{ background: vulnerabilityColors.high }} />
                {vulnerabilityLabels.high}: asset potenzialmente piu esposto a eventi catastrofali e danni da impatto diretto.
              </span>
              <span className="map-legend__item">
                <span className="map-legend__dot" style={{ background: vulnerabilityColors.medium }} />
                {vulnerabilityLabels.medium}: esposizione plausibile ma non estrema.
              </span>
              <span className="map-legend__item">
                <span className="map-legend__dot" style={{ background: vulnerabilityColors.low }} />
                {vulnerabilityLabels.low}: asset meno esposto al contatto diretto con l'evento.
              </span>
            </>
          ) : null}
          {mode === 'combined' ? (
            <>
              {visibleEventTypes.map((eventType) => (
                <span key={eventType} className="map-legend__item">
                  <span className="map-legend__dot" style={{ background: eventTypeColors[eventType] }} />
                  {eventTypeLabels[eventType]}: layer evento attivo.
                </span>
              ))}
              <span className="map-legend__item">
                <span className="map-legend__dot" style={{ background: impactColors.impacted }} />
                Cliente colpito: dentro il poligono o entro il raggio fallback dell'evento.
              </span>
              <span className="map-legend__item">
                <span className="map-legend__dot" style={{ background: impactColors.safe }} />
                Cliente non colpito: fuori dal perimetro geospaziale stimato.
              </span>
            </>
          ) : null}
          <span className="map-legend__note">
            Clicca un punto cliente per vedere il motivo del colore. Tipologie principali: {assetTypeLabels.shop}, {assetTypeLabels.apartment}, {assetTypeLabels.warehouse}
          </span>
        </div>
      </div>
    </div>
  );
}
