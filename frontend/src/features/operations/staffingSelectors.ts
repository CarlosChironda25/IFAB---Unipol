import type {
  Customer,
  CustomerImpactAssessment,
  StaffingAssignment,
  StaffingRecommendation,
  StaffingTargetRecommendation,
  Surveyor,
  StaffingPriority,
} from '../../types/exposure';
import type { DisasterEvent } from '../../types/event';
import { getVulnerabilityWeight } from './selectors';

/*
Il modulo staffingSelectors traduce l esposizione geospaziale in un primo piano operativo per i periti.
Stima i fabbisogni a 7 e 15 giorni e costruisce una priorita di assegnazione tra interni in zona, riallocazioni e outsourcing.
*/

const STANDARD_DAILY_CAPACITY_SQM = 120;
const LOCAL_ZONE_RADIUS_KM = 75;

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

function getScenarioCenter(
  impactedCustomers: Customer[],
  focusedEvent: DisasterEvent | null,
  events: DisasterEvent[]
): { lat: number; lng: number } | null {
  if (focusedEvent && typeof focusedEvent.latitude === 'number' && typeof focusedEvent.longitude === 'number') {
    return { lat: focusedEvent.latitude, lng: focusedEvent.longitude };
  }

  if (impactedCustomers.length) {
    const totals = impactedCustomers.reduce(
      (accumulator, customer) => ({
        lat: accumulator.lat + customer.latitude,
        lng: accumulator.lng + customer.longitude,
      }),
      { lat: 0, lng: 0 }
    );

    return {
      lat: totals.lat / impactedCustomers.length,
      lng: totals.lng / impactedCustomers.length,
    };
  }

  const firstEventWithCoords = events.find(
    (event) => typeof event.latitude === 'number' && typeof event.longitude === 'number'
  );

  if (!firstEventWithCoords) {
    return null;
  }

  return {
    lat: firstEventWithCoords.latitude as number,
    lng: firstEventWithCoords.longitude as number,
  };
}

function buildAssignment(
  surveyor: Surveyor,
  priority: StaffingPriority,
  center: { lat: number; lng: number }
): StaffingAssignment {
  const distanceKm = haversineDistanceKm(
    { lat: surveyor.latitude, lng: surveyor.longitude },
    center
  );
  const transferDays = distanceKm <= LOCAL_ZONE_RADIUS_KM ? 0 : Math.ceil(distanceKm / 320);

  return {
    surveyorId: surveyor.id,
    name: surveyor.name,
    kind: surveyor.kind,
    priority,
    homeBase: `${surveyor.city}, ${surveyor.region}`,
    distanceKm,
    travelDays: surveyor.availableInDays + transferDays,
    dailyCapacitySqm: surveyor.dailyCapacitySqm,
    costIndex: surveyor.costIndex,
  };
}

function buildTargetRecommendation(
  targetDays: number,
  requiredSurveyors: number,
  localAssignments: StaffingAssignment[],
  relocationAssignments: StaffingAssignment[],
  outsourcingAssignments: StaffingAssignment[]
): StaffingTargetRecommendation {
  const usableLocal = localAssignments.filter((assignment) => assignment.travelDays <= targetDays);
  const usableRelocation = relocationAssignments.filter((assignment) => assignment.travelDays <= targetDays);
  const usableOutsourcing = outsourcingAssignments.filter((assignment) => assignment.travelDays <= targetDays);

  const coveredByLocal = Math.min(usableLocal.length, requiredSurveyors);
  const remainingAfterLocal = Math.max(requiredSurveyors - coveredByLocal, 0);
  const coveredByRelocation = Math.min(usableRelocation.length, remainingAfterLocal);
  const remainingAfterRelocation = Math.max(remainingAfterLocal - coveredByRelocation, 0);
  const coveredByOutsourcing = Math.min(usableOutsourcing.length, remainingAfterRelocation);

  return {
    targetDays,
    requiredSurveyors,
    coveredByLocal,
    coveredByRelocation,
    coveredByOutsourcing,
    shortfall: Math.max(remainingAfterRelocation - coveredByOutsourcing, 0),
  };
}

export function buildStaffingRecommendation(
  customers: Customer[],
  assessments: CustomerImpactAssessment[],
  surveyors: Surveyor[],
  focusedEvent: DisasterEvent | null,
  events: DisasterEvent[]
): StaffingRecommendation {
  const assessmentsByCustomerId = new Map(assessments.map((assessment) => [assessment.customerId, assessment]));
  const impactedCustomers = customers.filter((customer) => assessmentsByCustomerId.get(customer.id)?.isImpacted);
  const weightedInspectionAreaSqm = impactedCustomers.reduce((sum, customer) => {
    const assessment = assessmentsByCustomerId.get(customer.id);
    return sum + customer.inspectionAreaSqm * getVulnerabilityWeight(assessment?.vulnerabilityHint ?? 'medium');
  }, 0);

  if (!impactedCustomers.length) {
    return {
      impactedCustomers: 0,
      impactedInspectionAreaSqm: 0,
      weightedInspectionAreaSqm: 0,
      internalInZone: 0,
      internalRelocatable: 0,
      externalAvailable: surveyors.filter((surveyor) => surveyor.kind === 'external').length,
      suggestedLocalAssignments: [],
      suggestedRelocationAssignments: [],
      suggestedOutsourcingAssignments: [],
      targets: [
        {
          targetDays: 7,
          requiredSurveyors: 0,
          coveredByLocal: 0,
          coveredByRelocation: 0,
          coveredByOutsourcing: 0,
          shortfall: 0,
        },
        {
          targetDays: 15,
          requiredSurveyors: 0,
          coveredByLocal: 0,
          coveredByRelocation: 0,
          coveredByOutsourcing: 0,
          shortfall: 0,
        },
      ],
    };
  }

  const scenarioCenter = getScenarioCenter(impactedCustomers, focusedEvent, events);
  if (!scenarioCenter) {
    return {
      impactedCustomers: impactedCustomers.length,
      impactedInspectionAreaSqm: impactedCustomers.reduce((sum, customer) => sum + customer.inspectionAreaSqm, 0),
      weightedInspectionAreaSqm,
      internalInZone: 0,
      internalRelocatable: 0,
      externalAvailable: 0,
      suggestedLocalAssignments: [],
      suggestedRelocationAssignments: [],
      suggestedOutsourcingAssignments: [],
      targets: [
        {
          targetDays: 7,
          requiredSurveyors: 0,
          coveredByLocal: 0,
          coveredByRelocation: 0,
          coveredByOutsourcing: 0,
          shortfall: 0,
        },
        {
          targetDays: 15,
          requiredSurveyors: 0,
          coveredByLocal: 0,
          coveredByRelocation: 0,
          coveredByOutsourcing: 0,
          shortfall: 0,
        },
      ],
    };
  }

  const allAssignments = surveyors.map((surveyor) => {
    const distanceKm = haversineDistanceKm(
      { lat: surveyor.latitude, lng: surveyor.longitude },
      scenarioCenter
    );

    if (surveyor.kind === 'internal' && distanceKm <= LOCAL_ZONE_RADIUS_KM) {
      return buildAssignment(surveyor, 'in-zone', scenarioCenter);
    }

    if (surveyor.kind === 'internal' && surveyor.mobility !== 'local') {
      return buildAssignment(surveyor, 'relocation', scenarioCenter);
    }

    return buildAssignment(surveyor, 'outsourcing', scenarioCenter);
  });

  const localAssignments = allAssignments
    .filter((assignment) => assignment.priority === 'in-zone')
    .sort((left, right) => left.travelDays - right.travelDays || left.distanceKm - right.distanceKm);
  const relocationAssignments = allAssignments
    .filter((assignment) => assignment.priority === 'relocation')
    .sort((left, right) => left.travelDays - right.travelDays || left.costIndex - right.costIndex);
  const outsourcingAssignments = allAssignments
    .filter((assignment) => assignment.priority === 'outsourcing')
    .sort((left, right) => left.costIndex - right.costIndex || left.travelDays - right.travelDays);

  const requiredSurveyors7 = Math.max(1, Math.ceil(weightedInspectionAreaSqm / (STANDARD_DAILY_CAPACITY_SQM * 7)));
  const requiredSurveyors15 = Math.max(1, Math.ceil(weightedInspectionAreaSqm / (STANDARD_DAILY_CAPACITY_SQM * 15)));

  return {
    impactedCustomers: impactedCustomers.length,
    impactedInspectionAreaSqm: impactedCustomers.reduce((sum, customer) => sum + customer.inspectionAreaSqm, 0),
    weightedInspectionAreaSqm,
    internalInZone: localAssignments.length,
    internalRelocatable: relocationAssignments.length,
    externalAvailable: outsourcingAssignments.length,
    suggestedLocalAssignments: localAssignments.slice(0, requiredSurveyors7),
    suggestedRelocationAssignments: relocationAssignments.slice(0, Math.max(requiredSurveyors7 - localAssignments.length, 0)),
    suggestedOutsourcingAssignments: outsourcingAssignments.slice(
      0,
      Math.max(requiredSurveyors7 - localAssignments.length - relocationAssignments.length, 0)
    ),
    targets: [
      buildTargetRecommendation(7, requiredSurveyors7, localAssignments, relocationAssignments, outsourcingAssignments),
      buildTargetRecommendation(15, requiredSurveyors15, localAssignments, relocationAssignments, outsourcingAssignments),
    ],
  };
}
