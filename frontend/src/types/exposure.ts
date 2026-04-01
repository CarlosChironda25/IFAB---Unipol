export type AssetType = 'apartment' | 'shop' | 'warehouse' | 'house' | 'office';

export type MapLayerMode = 'event' | 'customers' | 'combined';

export type ImpactReason = 'within-geojson' | 'within-radius' | 'not-impacted';

export type VulnerabilityHint = 'low' | 'medium' | 'high';

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
  highVulnerabilityCustomers: number;
  impactedByAssetType: Array<{
    assetType: AssetType;
    count: number;
  }>;
}
