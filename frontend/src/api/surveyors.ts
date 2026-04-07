import { mockSurveyors } from '../mocks/surveyors';
import type { Surveyor } from '../types/exposure';

export async function getSurveyors(signal?: AbortSignal): Promise<Surveyor[]> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      if (signal?.aborted) {
        reject(new DOMException('Richiesta annullata.', 'AbortError'));
        return;
      }

      resolve(mockSurveyors);
    }, 180);

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
