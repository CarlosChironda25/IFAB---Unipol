import type { AssetType, VulnerabilityHint } from '../types/exposure';

export const assetTypeLabels: Record<AssetType, string> = {
  apartment: 'Appartamento',
  shop: 'Negozio',
  warehouse: 'Magazzino',
  house: 'Casa',
  office: 'Ufficio',
};

export const vulnerabilityLabels: Record<VulnerabilityHint, string> = {
  low: 'Bassa vulnerabilità',
  medium: 'Vulnerabilita medià',
  high: 'Alta vulnerabilità',
};

export const vulnerabilityColors: Record<VulnerabilityHint, string> = {
  low: '#2a9d8f',
  medium: '#f4a261',
  high: '#d62828',
};

export const impactColors = {
  impacted: '#d9480f',
  safe: '#7c8b99',
  customer: '#0a9396',
};
