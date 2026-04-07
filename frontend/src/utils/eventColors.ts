import type { EventStatus, EventType } from '../types/event';

export const eventTypeLabels: Record<EventType, string> = {
  flood: 'Alluvione',
  storm: 'Tempesta',
  hail: 'Grandine',
  tornado: "Tromba d'aria",
  earthquake: 'Terremoto',
  wildfire: 'Incendio',
  drought: 'Siccita',
  blizzard: 'Bufera di neve',
  heatwave: 'Ondata di calore',
  coldwave: 'Ondata di gelo',
  unknown: 'Sconosciuto',
};

export const eventTypeColors: Record<EventType, string> = {
  flood: '#0077b6',
  storm: '#4c6ef5',
  hail: '#7b2cbf',
  tornado: '#3a0ca3',
  earthquake: '#d9480f',
  wildfire: '#e85d04',
  drought: '#b08968',
  blizzard: '#90e0ef',
  heatwave: '#f77f00',
  coldwave: '#4895ef',
  unknown: '#6c757d',
};

export const eventStatusLabels: Record<EventStatus, string> = {
  new: 'Nuovo',
  updated: 'Aggiornato',
  confirmed: 'Confermato',
};
