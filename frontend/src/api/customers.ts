import { mockCustomers } from '../mocks/customers';
import type { Customer } from '../types/exposure';

export async function getCustomers(signal?: AbortSignal): Promise<Customer[]> {
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
