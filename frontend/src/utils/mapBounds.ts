import type { DisasterEvent } from '../types/event';
import { extendBoundsWithEvent } from './geojson';

export function buildBoundsForEvents(events: DisasterEvent[]): google.maps.LatLngBounds | null {
  if (!events.length) {
    return null;
  }

  const bounds = new google.maps.LatLngBounds();

  for (const event of events) {
    extendBoundsWithEvent(bounds, event);
  }

  return bounds.isEmpty() ? null : bounds;
}
