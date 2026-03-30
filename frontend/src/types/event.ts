export type EventType =
  | 'flood'
  | 'storm'
  | 'hail'
  | 'earthquake'
  | 'wildfire'
  | 'unknown';

export type EventStatus = 'new' | 'updated' | 'confirmed';

export interface Article {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  snippet?: string;
}

export interface EventGeometry {
  type: 'Point' | 'Polygon' | 'MultiPolygon';
  coordinates: number[] | number[][][] | number[][][][];
}

export interface DisasterEvent {
  id: string;
  title: string;
  eventType: EventType;
  mainLocation: string;
  latitude?: number | null;
  longitude?: number | null;
  geometryGeoJson?: EventGeometry | null;
  startDate?: string | null;
  lastUpdate?: string | null;
  severity?: number | null;
  confidence?: number | null;
  sourcesCount: number;
  status: EventStatus;
  articles: Article[];
}

export interface EventFilters {
  search: string;
  eventType: EventType | 'all';
  status: EventStatus | 'all';
  dateFrom: string;
  dateTo: string;
  minSeverity: number;
  minConfidence: number;
}
