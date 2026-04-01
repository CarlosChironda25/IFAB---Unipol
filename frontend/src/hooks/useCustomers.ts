import { useEffect, useState } from 'react';
import { getCustomers } from '../api/customers';
import type { Customer } from '../types/exposure';

interface UseCustomersResult {
  customers: Customer[];
  isLoading: boolean;
  error: string | null;
}

export function useCustomers(): UseCustomersResult {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const fetchCustomers = async () => {
      setIsLoading(true);
      try {
        const nextCustomers = await getCustomers(controller.signal);
        setCustomers(nextCustomers);
        setError(null);
      } catch (fetchError) {
        if (fetchError instanceof Error && fetchError.name !== 'AbortError') {
          setError(fetchError.message);
        }
      } finally {
        setIsLoading(false);
      }
    };

    void fetchCustomers();
    return () => controller.abort();
  }, []);

  return { customers, isLoading, error };
}
