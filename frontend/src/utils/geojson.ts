import type { DisasterEvent, EventGeometry } from '../types/event';

function updateBoundsFromCoordinates(
  coordinates: EventGeometry['coordinates'],
  bounds: google.maps.LatLngBounds
): void {
  if (typeof coordinates[0] === 'number') {
    const [lng, lat] = coordinates as number[];
    bounds.extend({ lat, lng });
    return;
  }

  for (const nested of coordinates as Array<EventGeometry['coordinates']>) {
    updateBoundsFromCoordinates(nested, bounds);
  }
}

export function createGeoJsonFeature(event: DisasterEvent): GeoJSON.Feature | null {
  if (!event.geometryGeoJson) {
    return null;
  }

  return {
    type: 'Feature',
    geometry: {
      type: event.geometryGeoJson.type,
      coordinates: event.geometryGeoJson.coordinates as never,
    },
    properties: {
      eventId: event.id,
      eventType: event.eventType,
      title: event.title,
    },
  };
}

export function extendBoundsWithEvent(
  bounds: google.maps.LatLngBounds,
  event: DisasterEvent
): void {
  if (typeof event.latitude === 'number' && typeof event.longitude === 'number') {
    bounds.extend({ lat: event.latitude, lng: event.longitude });
  }

  if (event.geometryGeoJson) {
    updateBoundsFromCoordinates(event.geometryGeoJson.coordinates, bounds);
  }
}
