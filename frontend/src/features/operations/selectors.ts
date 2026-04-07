import type { Customer, CustomerImpactAssessment, ExposureSummary, VulnerabilityHint } from '../../types/exposure';
import type { DisasterEvent, EventGeometry } from '../../types/event';

export const DEFAULT_IMPACT_RADIUS_KM = 8;

export function getVulnerabilityWeight(vulnerabilityHint: VulnerabilityHint): number {
  if (vulnerabilityHint === 'high') {
    return 1.3;
  }

  if (vulnerabilityHint === 'low') {
    return 0.7;
  }

  return 1;
}

function haversineDistanceKm(
  first: { lat: number; lng: number },
  second: { lat: number; lng: number }
): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371;
  const deltaLat = toRadians(second.lat - first.lat);
  const deltaLng = toRadians(second.lng - first.lng);
  const lat1 = toRadians(first.lat);
  const lat2 = toRadians(second.lat);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isPointInLinearRing(point: { lat: number; lng: number }, ring: number[][]): boolean {
  let inside = false;

  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const [currentLng, currentLat] = ring[current];
    const [previousLng, previousLat] = ring[previous];
    const intersects =
      currentLat > point.lat !== previousLat > point.lat &&
      point.lng <
        ((previousLng - currentLng) * (point.lat - currentLat)) / (previousLat - currentLat || Number.EPSILON) +
          currentLng;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function isPointInsideGeometry(point: { lat: number; lng: number }, geometry: EventGeometry): boolean {
  if (geometry.type === 'Polygon') {
    return (geometry.coordinates as number[][][]).some((ring) => isPointInLinearRing(point, ring));
  }

  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates as number[][][][]).some((polygon) =>
      polygon.some((ring) => isPointInLinearRing(point, ring))
    );
  }

  if (geometry.type === 'Point') {
    const [lng, lat] = geometry.coordinates as number[];
    return point.lat === lat && point.lng === lng;
  }

  return false;
}

export function getCustomerVulnerability(customer: Customer): VulnerabilityHint {
  if (
    customer.hasUndergroundStorage ||
    customer.hasBasement ||
    customer.floorLevel < 0 ||
    customer.assetType === 'warehouse' ||
    (customer.assetType === 'shop' && customer.floorLevel <= 0)
  ) {
    return 'high';
  }

  if (customer.floorLevel >= 2 && customer.assetType === 'apartment') {
    return 'low';
  }

  return 'medium';
}

export function assessCustomerImpact(customer: Customer, event: DisasterEvent): CustomerImpactAssessment {
  const vulnerabilityHint = getCustomerVulnerability(customer);
  const point = { lat: customer.latitude, lng: customer.longitude };

  if (event.geometryGeoJson && isPointInsideGeometry(point, event.geometryGeoJson)) {
    return {
      customerId: customer.id,
      eventId: event.id,
      isImpacted: true,
      impactReason: 'within-geojson',
      vulnerabilityHint,
    };
  }

  if (typeof event.latitude === 'number' && typeof event.longitude === 'number') {
    const distance = haversineDistanceKm(point, {
      lat: event.latitude,
      lng: event.longitude,
    });

    if (distance <= (event.impactRadiusKm ?? DEFAULT_IMPACT_RADIUS_KM)) {
      return {
        customerId: customer.id,
        eventId: event.id,
        isImpacted: true,
        impactReason: 'within-radius',
        vulnerabilityHint,
      };
    }
  }

  return {
    customerId: customer.id,
    eventId: event.id,
    isImpacted: false,
    impactReason: 'not-impacted',
    vulnerabilityHint,
  };
}

export function buildCustomerImpactAssessments(
  customers: Customer[],
  events: DisasterEvent[]
): CustomerImpactAssessment[] {
  return customers.map((customer) => {
    for (const event of events) {
      const assessment = assessCustomerImpact(customer, event);
      if (assessment.isImpacted) {
        return assessment;
      }
    }

    return {
      customerId: customer.id,
      eventId: events[0]?.id ?? null,
      isImpacted: false,
      impactReason: 'not-impacted',
      vulnerabilityHint: getCustomerVulnerability(customer),
    };
  });
}

export function buildExposureSummary(
  customers: Customer[],
  assessments: CustomerImpactAssessment[]
): ExposureSummary {
  const assessmentsByCustomerId = new Map(assessments.map((assessment) => [assessment.customerId, assessment]));
  const impactedCustomers = customers.filter((customer) => assessmentsByCustomerId.get(customer.id)?.isImpacted);
  const impactedByAssetType = new Map<Customer['assetType'], number>();

  for (const customer of impactedCustomers) {
    impactedByAssetType.set(customer.assetType, (impactedByAssetType.get(customer.assetType) ?? 0) + 1);
  }

  return {
    customersInScope: customers.length,
    impactedCustomers: impactedCustomers.length,
    impactedInspectionAreaSqm: impactedCustomers.reduce((sum, customer) => sum + customer.inspectionAreaSqm, 0),
    weightedInspectionAreaSqm: impactedCustomers.reduce((sum, customer) => {
      const assessment = assessmentsByCustomerId.get(customer.id);
      return sum + customer.inspectionAreaSqm * getVulnerabilityWeight(assessment?.vulnerabilityHint ?? 'medium');
    }, 0),
    highVulnerabilityCustomers: impactedCustomers.filter(
      (customer) => assessmentsByCustomerId.get(customer.id)?.vulnerabilityHint === 'high'
    ).length,
    impactedByAssetType: Array.from(impactedByAssetType.entries())
      .map(([assetType, count]) => ({ assetType, count }))
      .sort((left, right) => right.count - left.count),
  };
}
