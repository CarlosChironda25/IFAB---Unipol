import type { MapLayerMode } from '../../types/exposure';

/*
MapModeSwitch permette di cambiare rapidamente il layer attivo della mappa.
Le tre modalita disponibili governano quali informazioni geografiche vengono mostrate all utente.
*/

interface MapModeSwitchProps {
  mode: MapLayerMode;
  onChange: (mode: MapLayerMode) => void;
}

const modes: Array<{ id: MapLayerMode; label: string }> = [
  { id: 'event', label: 'Evento climatico' },
  { id: 'customers', label: 'Clienti nel territorio' },
  { id: 'combined', label: 'Entrambi' },
];

export function MapModeSwitch({ mode, onChange }: MapModeSwitchProps) {
  return (
    <div className="map-mode-switch" role="tablist" aria-label="Modalita mappa">
      {modes.map((entry) => (
        <button
          key={entry.id}
          type="button"
          className={`map-mode-switch__button ${mode === entry.id ? 'map-mode-switch__button--active' : ''}`}
          onClick={() => onChange(entry.id)}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}
