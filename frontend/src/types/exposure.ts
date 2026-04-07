export type AssetType = 'apartment' | 'shop' | 'warehouse' | 'house' | 'office';

export type MapLayerMode = 'event' | 'customers' | 'combined';

export type ImpactReason = 'within-geojson' | 'within-radius' | 'not-impacted';

export type VulnerabilityHint = 'low' | 'medium' | 'high';

export type DamageScenario = 'scenario-a' | 'scenario-b' | 'scenario-c';

export type SurveyorKind = 'internal' | 'external';

export type SurveyorMobility = 'local' | 'regional' | 'national';

export type StaffingPriority = 'in-zone' | 'relocation' | 'outsourcing';

export interface Customer {
  id: string;
  policyId: string;
  code: string;
  latitude: number;
  longitude: number;
  assetType: AssetType;
  floorLevel: number;
  hasBasement: boolean;
  hasUndergroundStorage: boolean;
  inspectionAreaSqm: number;
  city: string;
  province: string;
  region: string;
  maxCoverageAmount: number;
  businessInterruptionDaily: number;
}

export interface CustomerImpactAssessment {
  customerId: string;
  eventId: string | null;
  isImpacted: boolean;
  impactReason: ImpactReason;
  vulnerabilityHint: VulnerabilityHint;
}

export interface ExposureSummary {
  customersInScope: number;
  impactedCustomers: number;
  impactedInspectionAreaSqm: number;
  weightedInspectionAreaSqm: number;
  highVulnerabilityCustomers: number;
  impactedByAssetType: Array<{
    assetType: AssetType;
    count: number;
  }>;
}

export interface Surveyor {
  id: string;
  name: string;
  kind: SurveyorKind;
  latitude: number;
  longitude: number;
  city: string;
  province: string;
  region: string;
  mobility: SurveyorMobility;
  dailyCapacitySqm: number;
  availableInDays: number;
  costIndex: number;
}

export interface StaffingAssignment {
  surveyorId: string;
  name: string;
  kind: SurveyorKind;
  priority: StaffingPriority;
  homeBase: string;
  distanceKm: number;
  travelDays: number;
  dailyCapacitySqm: number;
  costIndex: number;
}

export interface StaffingTargetRecommendation {
  targetDays: number;
  requiredSurveyors: number;
  coveredByLocal: number;
  coveredByRelocation: number;
  coveredByOutsourcing: number;
  shortfall: number;
}

export interface StaffingRecommendation {
  impactedCustomers: number;
  impactedInspectionAreaSqm: number;
  weightedInspectionAreaSqm: number;
  workloadHours: number;
  estimatedDamageAmount: number;
  estimatedSavingsAmount: number;
  internalInZone: number;
  internalRelocatable: number;
  externalAvailable: number;
  suggestedLocalAssignments: StaffingAssignment[];
  suggestedRelocationAssignments: StaffingAssignment[];
  suggestedOutsourcingAssignments: StaffingAssignment[];
  targets: StaffingTargetRecommendation[];
}
