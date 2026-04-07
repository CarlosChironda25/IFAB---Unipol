import type {
  Customer,
  CustomerImpactAssessment,
  DamageScenario,
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
Applica la formula di workload del task, stima danno e risparmio in scenario A/B/C e ordina la copertura tra interni in zona, riallocazioni e outsourcing.
*/

const TARGET_DAYS_SHORT = 7;
const TARGET_DAYS_LONG = 15;
const WORK_HOURS_PER_DAY = 8;
const SURVEYOR_EFFICIENCY = 0.7;
const AVERAGE_TRAVEL_HOURS = 0.33;
const SURVEYOR_DAILY_COST = 650;
const BUSINESS_INTERRUPTION_SAVINGS_FACTOR = 0.25;
const LOCAL_ZONE_RADIUS_KM = 75;

type DamageLevel = 'underground' | 'ground' | 'upper';

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

function getWorkloadCoefficient(customer: Customer): number {
  if (customer.assetType === 'warehouse') {
    return 0.8;
  }

  if (customer.assetType === 'shop' || customer.assetType === 'office') {
    return 1.5;
  }

  return 2;
}

function getSavingsCoefficient(customer: Customer): number {
  if (customer.assetType === 'shop' || customer.assetType === 'office' || customer.assetType === 'warehouse') {
    return 0.5;
  }

  return 0.3;
}

function getDamageShares(customer: Customer): Array<{ level: DamageLevel; share: number }> {
  const mainResidentialLevel: DamageLevel = customer.floorLevel >= 1 ? 'upper' : 'ground';

  if (customer.assetType === 'apartment') {
    if (customer.hasBasement || customer.hasUndergroundStorage) {
      return [
        { level: mainResidentialLevel, share: 0.85 },
        { level: 'underground', share: 0.15 },
      ];
    }

    return [{ level: mainResidentialLevel, share: 1 }];
  }

  if (customer.assetType === 'house') {
    if (customer.hasBasement || customer.hasUndergroundStorage) {
      return [
        { level: 'ground', share: 0.5 },
        { level: 'upper', share: 0.35 },
        { level: 'underground', share: 0.15 },
      ];
    }

    return [
      { level: 'ground', share: 0.65 },
      { level: 'upper', share: 0.35 },
    ];
  }

  if (customer.assetType === 'warehouse') {
    if (customer.hasBasement || customer.hasUndergroundStorage) {
      return [
        { level: 'underground', share: 0.5 },
        { level: 'ground', share: 0.5 },
      ];
    }

    return [{ level: 'ground', share: 1 }];
  }

  if (customer.hasBasement || customer.hasUndergroundStorage) {
    return [
      { level: 'underground', share: 0.15 },
      { level: 'ground', share: 0.7 },
      { level: 'upper', share: 0.15 },
    ];
  }

  return [
    { level: 'ground', share: 0.85 },
    { level: 'upper', share: 0.15 },
  ];
}

function getScenarioDamageProbability(level: DamageLevel, scenario: DamageScenario): number {
  if (scenario === 'scenario-a') {
    if (level === 'underground') {
      return 0.8;
    }

    if (level === 'ground') {
      return 0.2;
    }

    return 0;
  }

  if (scenario === 'scenario-b') {
    if (level === 'underground') {
      return 0.95;
    }

    if (level === 'ground') {
      return 0.7;
    }

    return 0.05;
  }

  if (level === 'underground') {
    return 1;
  }

  if (level === 'ground') {
    return 0.95;
  }

  return 0.5;
}

function estimatePropertyDamage(customer: Customer, scenario: DamageScenario): number {
  const damageRatio = getDamageShares(customer).reduce((sum, share) => {
    return sum + share.share * getScenarioDamageProbability(share.level, scenario);
  }, 0);

  return customer.maxCoverageAmount * damageRatio;
}

function estimatePropertySavings(customer: Customer, estimatedDamage: number): number {
  const mitigationSavings = estimatedDamage * getSavingsCoefficient(customer);
  const interruptionSavings =
    customer.businessInterruptionDaily * BUSINESS_INTERRUPTION_SAVINGS_FACTOR * TARGET_DAYS_SHORT;

  return mitigationSavings + interruptionSavings;
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
  events: DisasterEvent[],
  damageScenario: DamageScenario
): StaffingRecommendation {
  const assessmentsByCustomerId = new Map(assessments.map((assessment) => [assessment.customerId, assessment]));
  const impactedCustomers = customers.filter((customer) => assessmentsByCustomerId.get(customer.id)?.isImpacted);
  const weightedInspectionAreaSqm = impactedCustomers.reduce((sum, customer) => {
    const assessment = assessmentsByCustomerId.get(customer.id);
    return sum + customer.inspectionAreaSqm * getVulnerabilityWeight(assessment?.vulnerabilityHint ?? 'medium');
  }, 0);
  const impactedInspectionAreaSqm = impactedCustomers.reduce((sum, customer) => sum + customer.inspectionAreaSqm, 0);
  const workloadHours =
    impactedCustomers.reduce((sum, customer) => {
      return sum + (customer.inspectionAreaSqm / 100) * getWorkloadCoefficient(customer);
    }, 0) +
    impactedCustomers.length * AVERAGE_TRAVEL_HOURS;

  if (!impactedCustomers.length) {
    return {
      impactedCustomers: 0,
      impactedInspectionAreaSqm: 0,
      weightedInspectionAreaSqm: 0,
      workloadHours: 0,
      estimatedDamageAmount: 0,
      estimatedSavingsAmount: 0,
      internalInZone: 0,
      internalRelocatable: 0,
      externalAvailable: surveyors.filter((surveyor) => surveyor.kind === 'external').length,
      suggestedLocalAssignments: [],
      suggestedRelocationAssignments: [],
      suggestedOutsourcingAssignments: [],
      targets: [
        {
          targetDays: TARGET_DAYS_SHORT,
          requiredSurveyors: 0,
          coveredByLocal: 0,
          coveredByRelocation: 0,
          coveredByOutsourcing: 0,
          shortfall: 0,
        },
        {
          targetDays: TARGET_DAYS_LONG,
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
  const estimatedDamageAmount = impactedCustomers.reduce((sum, customer) => {
    return sum + estimatePropertyDamage(customer, damageScenario);
  }, 0);
  const requiredSurveyors7 = Math.max(
    1,
    Math.ceil(workloadHours / (TARGET_DAYS_SHORT * WORK_HOURS_PER_DAY * SURVEYOR_EFFICIENCY))
  );
  const requiredSurveyors15 = Math.max(
    1,
    Math.ceil(workloadHours / (TARGET_DAYS_LONG * WORK_HOURS_PER_DAY * SURVEYOR_EFFICIENCY))
  );
  const estimatedSavingsAmount =
    impactedCustomers.reduce((sum, customer) => {
      const propertyDamage = estimatePropertyDamage(customer, damageScenario);
      return sum + estimatePropertySavings(customer, propertyDamage);
    }, 0) -
    requiredSurveyors7 * TARGET_DAYS_SHORT * SURVEYOR_DAILY_COST;

  if (!scenarioCenter) {
    return {
      impactedCustomers: impactedCustomers.length,
      impactedInspectionAreaSqm,
      weightedInspectionAreaSqm,
      workloadHours,
      estimatedDamageAmount,
      estimatedSavingsAmount,
      internalInZone: 0,
      internalRelocatable: 0,
      externalAvailable: 0,
      suggestedLocalAssignments: [],
      suggestedRelocationAssignments: [],
      suggestedOutsourcingAssignments: [],
      targets: [
        {
          targetDays: TARGET_DAYS_SHORT,
          requiredSurveyors: requiredSurveyors7,
          coveredByLocal: 0,
          coveredByRelocation: 0,
          coveredByOutsourcing: 0,
          shortfall: requiredSurveyors7,
        },
        {
          targetDays: TARGET_DAYS_LONG,
          requiredSurveyors: requiredSurveyors15,
          coveredByLocal: 0,
          coveredByRelocation: 0,
          coveredByOutsourcing: 0,
          shortfall: requiredSurveyors15,
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

  return {
    impactedCustomers: impactedCustomers.length,
    impactedInspectionAreaSqm,
    weightedInspectionAreaSqm,
    workloadHours,
    estimatedDamageAmount,
    estimatedSavingsAmount,
    internalInZone: localAssignments.length,
    internalRelocatable: relocationAssignments.length,
    externalAvailable: outsourcingAssignments.length,
    suggestedLocalAssignments: localAssignments.slice(0, requiredSurveyors7),
    suggestedRelocationAssignments: relocationAssignments.slice(
      0,
      Math.max(requiredSurveyors7 - localAssignments.length, 0)
    ),
    suggestedOutsourcingAssignments: outsourcingAssignments.slice(
      0,
      Math.max(requiredSurveyors7 - localAssignments.length - relocationAssignments.length, 0)
    ),
    targets: [
      buildTargetRecommendation(
        TARGET_DAYS_SHORT,
        requiredSurveyors7,
        localAssignments,
        relocationAssignments,
        outsourcingAssignments
      ),
      buildTargetRecommendation(
        TARGET_DAYS_LONG,
        requiredSurveyors15,
        localAssignments,
        relocationAssignments,
        outsourcingAssignments
      ),
    ],
  };
}
