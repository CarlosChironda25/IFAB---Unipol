import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { useEffect, useMemo, useRef } from 'react';
import { useGoogleMap } from '../hooks/useGoogleMap';
import type { DisasterEvent } from '../types/event';
import { eventTypeColors, eventTypeLabels } from '../utils/eventColors';
import { createGeoJsonFeature } from '../utils/geojson';
import { buildBoundsForEvents } from '../utils/mapBounds';

interface MapViewProps {
  events: DisasterEvent[];
  selectedEventId: string | null;
  onSelect: (eventId: string) => void;
}

function createMarkerContent(event: DisasterEvent, isSelected: boolean): HTMLDivElement {
  const element = document.createElement('div');
  element.className = `map-marker ${isSelected ? 'map-marker--selected' : ''}`;
  element.style.setProperty('--marker-color', eventTypeColors[event.eventType]);
  element.innerHTML = `
    <span class="map-marker__dot"></span>
    <span class="map-marker__label">${eventTypeLabels[event.eventType]}</span>
  `;
  return element;
}

function getSelectedEvent(events: DisasterEvent[], selectedEventId: string | null): DisasterEvent | null {
  return events.find((event) => event.id === selectedEventId) ?? null;
}

export function MapView({ events, selectedEventId, onSelect }: MapViewProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const mapId = import.meta.env.VITE_GOOGLE_MAP_ID;
  const { status, error } = useGoogleMap(apiKey, mapId);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const dataClickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const selectedEvent = useMemo(
    () => getSelectedEvent(events, selectedEventId),
    [events, selectedEventId]
  );

  useEffect(() => {
    if (status !== 'ready' || !containerRef.current || mapRef.current) {
      return;
    }

    mapRef.current = new google.maps.Map(containerRef.current, {
      center: { lat: 42.5, lng: 12.5 },
      zoom: 6,
      mapId: mapId || undefined,
      disableDefaultUI: true,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
    });

    dataClickListenerRef.current = mapRef.current.data.addListener('click', (event: google.maps.Data.MouseEvent) => {
      const eventId = event.feature.getProperty('eventId');
      if (typeof eventId === 'string') {
        onSelect(eventId);
      }
    });
  }, [mapId, onSelect, status]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    markersRef.current.forEach((marker) => {
      marker.map = null;
    });
    markersRef.current = [];
    clustererRef.current?.clearMarkers();
    clustererRef.current = null;

    map.data.forEach((feature) => {
      map.data.remove(feature);
    });

    const markers = events
      .filter((event) => typeof event.latitude === 'number' && typeof event.longitude === 'number')
      .map((event) => {
        const marker = new google.maps.marker.AdvancedMarkerElement({
          position: {
            lat: event.latitude as number,
            lng: event.longitude as number,
          },
          content: createMarkerContent(event, event.id === selectedEventId),
        });

        marker.addListener('click', () => onSelect(event.id));
        return marker;
      });

    if (markers.length > 10) {
      clustererRef.current = new MarkerClusterer({
        map,
        markers,
      });
    } else {
      markers.forEach((marker) => {
        marker.map = map;
      });
    }

    markersRef.current = markers;

    for (const event of events) {
      const feature = createGeoJsonFeature(event);

      if (feature && feature.geometry.type !== 'Point') {
        map.data.addGeoJson(feature);
      }
    }

    map.data.setStyle((feature) => {
      const eventId = feature.getProperty('eventId');
      const event = events.find((candidate) => candidate.id === eventId);
      const color = event ? eventTypeColors[event.eventType] : '#6c757d';
      const isSelected = eventId === selectedEventId;

      return {
        fillColor: color,
        fillOpacity: isSelected ? 0.35 : 0.15,
        strokeColor: color,
        strokeWeight: isSelected ? 3 : 2,
      };
    });

    const bounds = buildBoundsForEvents(selectedEvent ? [selectedEvent] : events);
    if (bounds) {
      map.fitBounds(bounds, 64);
    }
  }, [events, onSelect, selectedEvent, selectedEventId]);

  useEffect(() => {
    return () => {
      dataClickListenerRef.current?.remove();
      clustererRef.current?.clearMarkers();
      markersRef.current.forEach((marker) => {
        marker.map = null;
      });
    };
  }, []);

  if (status === 'missing-key') {
    return (
      <section className="map-shell map-shell--fallback">
        <div className="map-fallback">
          <span className="eyebrow">Google Maps non configurato</span>
          <h2>Mappa pronta, chiave assente</h2>
          <p>
            Inserisci <code>VITE_GOOGLE_MAPS_API_KEY</code> nel file <code>frontend/.env</code> per attivare la
            mappa reale. Il resto della dashboard resta funzionante e usa il dataset mock locale per mostrare gli
            eventi.
          </p>
          <div className="map-fallback__grid">
            {events.map((event) => (
              <button key={event.id} type="button" onClick={() => onSelect(event.id)}>
                <strong>{event.title}</strong>
                <span>{event.mainLocation}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="map-shell">
      {status === 'loading' ? (
        <div className="map-overlay">Caricamento Google Maps...</div>
      ) : null}
      {status === 'error' ? <div className="map-overlay map-overlay--error">{error}</div> : null}
      <div ref={containerRef} className="map-canvas" />
    </section>
  );
}
