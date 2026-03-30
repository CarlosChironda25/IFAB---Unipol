import type { EventStatus, EventType } from '../types/event';

export const eventTypeLabels: Record<EventType, string> = {
  flood: 'Alluvione',
  storm: 'Tempesta',
  hail: 'Grandine',
  earthquake: 'Terremoto',
  wildfire: 'Incendio',
  unknown: 'Sconosciuto',
};

export const eventTypeColors: Record<EventType, string> = {
  flood: '#0077b6',
  storm: '#4c6ef5',
  hail: '#7b2cbf',
  earthquake: '#d9480f',
  wildfire: '#e85d04',
  unknown: '#6c757d',
};

export const eventStatusLabels: Record<EventStatus, string> = {
  new: 'Nuovo',
  updated: 'Aggiornato',
  confirmed: 'Confermato',
};
