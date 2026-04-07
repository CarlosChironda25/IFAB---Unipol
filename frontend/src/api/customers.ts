import { mockCustomers } from '../mocks/customers';
import type { Customer } from '../types/exposure';

interface BackendCustomer {
  id: number;
  full_name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  policy_type?: string | null;
  policy_number?: string | null;
  risk_level?: number | null;
}

function parseAddress(address?: string | null): { city: string; province: string; region: string } {
  const fallback = { city: 'Localita non disponibile', province: 'ND', region: 'ND' };
  if (!address) {
    return fallback;
  }

  const parts = address.split(',').map((entry) => entry.trim()).filter(Boolean);
  return {
    city: parts[0] ?? fallback.city,
    province: parts[1] ?? fallback.province,
    region: parts[2] ?? fallback.region,
  };
}

function mapPolicyType(policyType?: string | null): Customer['assetType'] {
  if (policyType === 'Agricola') {
    return 'warehouse';
  }

  if (policyType === 'Business' || policyType === 'Azienda') {
    return 'shop';
  }

  if (policyType === 'Office') {
    return 'office';
  }

  return 'house';
}

function mapBackendCustomer(customer: BackendCustomer): Customer {
  const assetType = mapPolicyType(customer.policy_type);
  const address = parseAddress(customer.address);
  const riskLevel = customer.risk_level ?? 1;
  const isBusinessAsset = assetType === 'shop' || assetType === 'warehouse' || assetType === 'office';

  return {
    id: String(customer.id),
    policyId: customer.policy_number ?? `POL-${customer.id}`,
    code: customer.policy_number ?? `CLI-${customer.id}`,
    latitude: customer.latitude ?? 0,
    longitude: customer.longitude ?? 0,
    assetType,
    floorLevel: assetType === 'house' ? 1 : 0,
    hasBasement: riskLevel >= 1.15,
    hasUndergroundStorage: riskLevel >= 1.35,
    inspectionAreaSqm: isBusinessAsset ? 180 : 120,
    city: address.city,
    province: address.province,
    region: address.region,
    maxCoverageAmount: isBusinessAsset ? 450000 : 280000,
    businessInterruptionDaily: isBusinessAsset ? 1200 : 0,
  };
}

async function getCustomersFromBackend(signal?: AbortSignal): Promise<Customer[]> {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  if (!apiBaseUrl) {
    throw new Error('API base URL non configurata.');
  }

  const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/customers`, { signal });
  if (!response.ok) {
    throw new Error(`Backend customers non disponibile (${response.status}).`);
  }

  const payload = (await response.json()) as BackendCustomer[];
  return payload.map(mapBackendCustomer);
}

export async function getCustomers(signal?: AbortSignal): Promise<Customer[]> {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

  if (apiBaseUrl) {
    return getCustomersFromBackend(signal);
  }

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      if (signal?.aborted) {
        reject(new DOMException('Richiesta annullata.', 'AbortError'));
        return;
      }

      resolve(mockCustomers);
    }, 220);

    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeoutId);
        reject(new DOMException('Richiesta annullata.', 'AbortError'));
      },
      { once: true }
    );
  });
}
