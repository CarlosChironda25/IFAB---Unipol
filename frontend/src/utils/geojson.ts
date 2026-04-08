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

function collectGeometryPoints(
  coordinates: EventGeometry['coordinates'],
  points: Array<{ lat: number; lng: number }>
): void {
  if (typeof coordinates[0] === 'number') {
    const [lng, lat] = coordinates as number[];
    points.push({ lat, lng });
    return;
  }

  for (const nested of coordinates as Array<EventGeometry['coordinates']>) {
    collectGeometryPoints(nested, points);
  }
}

export function getEventAnchor(event: DisasterEvent): { lat: number; lng: number } | null {
  if (event.geometryGeoJson) {
    const points: Array<{ lat: number; lng: number }> = [];
    collectGeometryPoints(event.geometryGeoJson.coordinates, points);
    if (points.length) {
      const totals = points.reduce(
        (accumulator, point) => ({
          lat: accumulator.lat + point.lat,
          lng: accumulator.lng + point.lng,
        }),
        { lat: 0, lng: 0 }
      );

      return {
        lat: totals.lat / points.length,
        lng: totals.lng / points.length,
      };
    }
  }

  if (typeof event.latitude === 'number' && typeof event.longitude === 'number') {
    return { lat: event.latitude, lng: event.longitude };
  }

  return null;
}
