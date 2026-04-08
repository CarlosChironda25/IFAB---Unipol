import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { useEffect, useMemo, useRef } from 'react';
import { useGoogleMap } from '../../hooks/useGoogleMap';
import type { Customer, CustomerImpactAssessment, MapLayerMode } from '../../types/exposure';
import type { DisasterEvent } from '../../types/event';
import { assetTypeLabels, impactColors, vulnerabilityColors, vulnerabilityLabels } from '../../utils/customerMeta';
import { eventTypeColors, eventTypeLabels } from '../../utils/eventColors';
import { createGeoJsonFeature, extendBoundsWithEvent, getEventAnchor } from '../../utils/geojson';
import { OperationalMapControls } from './OperationalMapControls';

/*
OperationalMapView coordina la mappa principale del cruscotto operativo.
Gestisce i layer eventi/clienti, la selezione dei marker, il focus geografico e il fallback quando Google Maps non e disponibile.
*/

interface OperationalMapViewProps {
  mode: MapLayerMode;
  events: DisasterEvent[];
  allEvents: DisasterEvent[];
  customers: Customer[];
  assessments: CustomerImpactAssessment[];
  focusedEventId: string | null;
  selectedCustomerId: string | null;
  onModeChange: (mode: MapLayerMode) => void;
  onFocusedEventChange: (eventId: string | null) => void;
  onSelectedCustomerChange: (customerId: string | null) => void;
}

function extendBoundsWithCustomer(bounds: google.maps.LatLngBounds, customer: Customer): void {
  bounds.extend({ lat: customer.latitude, lng: customer.longitude });
}

function buildOperationalBounds(
  mode: MapLayerMode,
  events: DisasterEvent[],
  customers: Customer[]
): google.maps.LatLngBounds | null {
  const bounds = new google.maps.LatLngBounds();

  if (mode !== 'customers') {
    events.forEach((event) => extendBoundsWithEvent(bounds, event));
  }

  if (mode !== 'event') {
    customers.forEach((customer) => extendBoundsWithCustomer(bounds, customer));
  }

  return bounds.isEmpty() ? null : bounds;
}

function createEventMarkerContent(event: DisasterEvent, isFocused: boolean): HTMLDivElement {
  const element = document.createElement('div');
  element.className = `map-marker ${isFocused ? 'map-marker--selected' : ''}`;
  element.style.setProperty('--marker-color', eventTypeColors[event.eventType]);
  element.innerHTML = `
    <span class="map-marker__dot"></span>
    <span class="map-marker__label">${eventTypeLabels[event.eventType]}</span>
  `;
  return element;
}

function bindMarkerSelection(
  marker: google.maps.marker.AdvancedMarkerElement,
  content: HTMLElement | null | undefined,
  onSelect: () => void
): void {
  marker.addEventListener('gmp-click', onSelect);
  content?.addEventListener('click', (event) => {
    event.stopPropagation();
    onSelect();
  });
}

function createCustomerMarkerContent(
  customer: Customer,
  assessment: CustomerImpactAssessment | undefined,
  mode: MapLayerMode,
  isSelected: boolean
): HTMLDivElement {
  const element = document.createElement('div');
  const isImpacted = Boolean(assessment?.isImpacted);
  const color =
    mode === 'combined'
      ? isImpacted
        ? impactColors.impacted
        : impactColors.safe
      : vulnerabilityColors[assessment?.vulnerabilityHint ?? 'medium'];

  element.className = `customer-marker ${isImpacted && mode === 'combined' ? 'customer-marker--impacted' : ''} ${
    isSelected ? 'customer-marker--selected' : ''
  }`;
  element.dataset.customerId = customer.id;
  element.style.setProperty('--customer-color', color);
  element.innerHTML = `
    <span class="customer-marker__dot"></span>
    <span class="customer-marker__code">${customer.code}</span>
  `;
  return element;
}

function getFallbackCustomers(
  mode: MapLayerMode,
  customers: Customer[],
  assessments: CustomerImpactAssessment[]
): Customer[] {
  if (mode !== 'combined') {
    return customers;
  }

  const impactedIds = new Set(
    assessments.filter((assessment) => assessment.isImpacted).map((assessment) => assessment.customerId)
  );

  return customers.filter((customer) => impactedIds.has(customer.id));
}

function buildEventBounds(event: DisasterEvent): google.maps.LatLngBounds | null {
  const bounds = new google.maps.LatLngBounds();
  extendBoundsWithEvent(bounds, event);
  return bounds.isEmpty() ? null : bounds;
}

function getImpactReasonLabel(assessment: CustomerImpactAssessment, impactEvent: DisasterEvent | null): string {
  if (assessment.impactReason === 'within-geojson') {
    return `Dentro il perimetro geojson di ${impactEvent?.title ?? 'un evento attivo'}`;
  }

  if (assessment.impactReason === 'within-radius') {
    return `Entro il raggio fallback${impactEvent?.impactRadiusKm ? ` di ${impactEvent.impactRadiusKm} km` : ''}`;
  }

  return 'Fuori dal perimetro stimato';
}

export function OperationalMapView({
  mode,
  events,
  allEvents,
  customers,
  assessments,
  focusedEventId,
  selectedCustomerId,
  onModeChange,
  onFocusedEventChange,
  onSelectedCustomerChange,
}: OperationalMapViewProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const mapId = import.meta.env.VITE_GOOGLE_MAP_ID;
  const { status, error } = useGoogleMap(apiKey, mapId);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const eventMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const customerMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const customerClustererRef = useRef<MarkerClusterer | null>(null);
  const dataClickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const assessmentsByCustomerId = useMemo(
    () => new Map(assessments.map((assessment) => [assessment.customerId, assessment])),
    [assessments]
  );
  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId]
  );
  const selectedAssessment = useMemo(
    () => (selectedCustomerId ? assessmentsByCustomerId.get(selectedCustomerId) ?? null : null),
    [assessmentsByCustomerId, selectedCustomerId]
  );
  const selectedImpactEvent = useMemo(
    () =>
      selectedAssessment?.eventId
        ? allEvents.find((event) => event.id === selectedAssessment.eventId) ?? null
        : null,
    [allEvents, selectedAssessment]
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
        onSelectedCustomerChange(null);
        onFocusedEventChange(eventId);
      }
    });
  }, [mapId, onFocusedEventChange, onSelectedCustomerChange, status]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    eventMarkersRef.current.forEach((marker) => {
      marker.map = null;
    });
    customerMarkersRef.current.forEach((marker) => {
      marker.map = null;
    });
    eventMarkersRef.current = [];
    customerMarkersRef.current = [];
    customerClustererRef.current?.clearMarkers();
    customerClustererRef.current = null;

    map.data.forEach((feature) => {
      map.data.remove(feature);
    });

    if (mode !== 'customers') {
      const eventMarkers = events
        .map((event) => ({ event, anchor: getEventAnchor(event) }))
        .filter((entry) => Boolean(entry.anchor))
        .map((entry) => {
          const content = createEventMarkerContent(entry.event, entry.event.id === focusedEventId);
          const marker = new google.maps.marker.AdvancedMarkerElement({
            position: entry.anchor as { lat: number; lng: number },
            content,
            gmpClickable: true,
          });

          bindMarkerSelection(marker, content, () => {
            onSelectedCustomerChange(null);
            onFocusedEventChange(entry.event.id);
          });
          marker.map = map;
          return marker;
        });

      eventMarkersRef.current = eventMarkers;

      for (const event of events) {
        const feature = createGeoJsonFeature(event);
        if (feature && feature.geometry.type !== 'Point') {
          map.data.addGeoJson(feature);
        }
      }
    }

    map.data.setStyle((feature) => {
      const eventId = feature.getProperty('eventId');
      const event = events.find((candidate) => candidate.id === eventId);
      const color = event ? eventTypeColors[event.eventType] : '#6c757d';
      const isFocused = eventId === focusedEventId;

      return {
        fillColor: color,
        fillOpacity: isFocused ? 0.34 : 0.15,
        strokeColor: color,
        strokeWeight: isFocused ? 3 : 2,
      };
    });

    if (mode !== 'event') {
      const customerMarkers = customers.map((customer) => {
        const content = createCustomerMarkerContent(
          customer,
          assessmentsByCustomerId.get(customer.id),
          mode,
          selectedCustomerId === customer.id
        );
        const marker = new google.maps.marker.AdvancedMarkerElement({
          position: {
            lat: customer.latitude,
            lng: customer.longitude,
          },
          content,
          gmpClickable: true,
        });

        bindMarkerSelection(marker, content, () => {
          onSelectedCustomerChange(customer.id);
        });
        return marker;
      });

      customerMarkersRef.current = customerMarkers;
      customerClustererRef.current = new MarkerClusterer({
        map,
        markers: customerMarkers,
      });
    }
  }, [
    assessmentsByCustomerId,
    customers,
    events,
    focusedEventId,
    mode,
    onFocusedEventChange,
    onSelectedCustomerChange,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    customerMarkersRef.current.forEach((marker) => {
      const content = marker.content instanceof HTMLElement ? marker.content : null;
      content?.classList.toggle('customer-marker--selected', content.dataset.customerId === selectedCustomer?.id);
    });
  }, [selectedCustomer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const bounds = buildOperationalBounds(mode, events, customers);
    if (bounds) {
      map.fitBounds(bounds, 64);
    }
  }, [customers, events, mode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mode !== 'customers' || !focusedEventId) {
      return;
    }

    const focusedEvent = allEvents.find((event) => event.id === focusedEventId);
    if (!focusedEvent) {
      return;
    }

    const bounds = buildEventBounds(focusedEvent);
    if (bounds) {
      map.fitBounds(bounds, 96);
      return;
    }

    const anchor = getEventAnchor(focusedEvent);
    if (anchor) {
      map.panTo(anchor);
      if ((map.getZoom() ?? 0) < 9) {
        map.setZoom(9);
      }
    }
  }, [allEvents, focusedEventId, mode]);

  useEffect(() => {
    return () => {
      dataClickListenerRef.current?.remove();
      customerClustererRef.current?.clearMarkers();
      eventMarkersRef.current.forEach((marker) => {
        marker.map = null;
      });
      customerMarkersRef.current.forEach((marker) => {
        marker.map = null;
      });
    };
  }, []);

  const fallbackCustomers = getFallbackCustomers(mode, customers, assessments);

  if (status === 'missing-key' || status === 'error') {
    return (
      <section className="map-shell map-shell--fallback">
        <div className="map-fallback map-fallback--operations">
          <OperationalMapControls
            mode={mode}
            events={allEvents}
            focusedEventId={focusedEventId}
            onModeChange={onModeChange}
            onFocusedEventChange={onFocusedEventChange}
          />
          <div className="map-fallback__status">
            {status === 'missing-key'
              ? 'Google Maps non configurato. La vista fallback mostra comunque eventi e clienti del mock.'
              : error}
          </div>
          <div className="map-fallback__grid">
            {mode !== 'customers'
              ? events.map((event) => (
                  <button key={event.id} type="button" onClick={() => onFocusedEventChange(event.id)}>
                    <strong>{event.title}</strong>
                    <span>{event.mainLocation}</span>
                  </button>
                ))
              : null}
            {mode !== 'event'
              ? fallbackCustomers.map((customer) => (
                  <button key={customer.id} type="button" onClick={() => onSelectedCustomerChange(customer.id)}>
                    <strong>{customer.code}</strong>
                    <span>
                      {customer.city} · {customer.inspectionAreaSqm} mq
                    </span>
                  </button>
                ))
              : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="map-shell map-shell--operations">
      <OperationalMapControls
        mode={mode}
        events={allEvents}
        focusedEventId={focusedEventId}
        onModeChange={onModeChange}
        onFocusedEventChange={onFocusedEventChange}
      />
      {mode !== 'event' ? (
        <div className="map-selection-banner">
          {selectedCustomer && selectedAssessment ? (
            <>
              <div className="map-selection-banner__header">
                <strong>{selectedCustomer.code}</strong>
                <span>{assetTypeLabels[selectedCustomer.assetType]}</span>
              </div>
              <div className="map-selection-banner__meta">
                <span>
                  {selectedCustomer.city}, {selectedCustomer.province}
                </span>
                <span>{vulnerabilityLabels[selectedAssessment.vulnerabilityHint]}</span>
                <span>{getImpactReasonLabel(selectedAssessment, selectedImpactEvent)}</span>
                <span>{selectedCustomer.inspectionAreaSqm} mq stimati</span>
              </div>
            </>
          ) : (
            <span className="map-selection-banner__placeholder">
              Seleziona un cliente sulla mappa per vedere subito il motivo del colore senza scendere nella dashboard.
            </span>
          )}
        </div>
      ) : null}
      {status === 'loading' ? <div className="map-overlay">Caricamento Google Maps...</div> : null}
      <div ref={containerRef} className="map-canvas map-canvas--operations" />
    </section>
  );
}
