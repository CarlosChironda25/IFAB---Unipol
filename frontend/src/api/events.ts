import { mockEvents } from '../mocks/events';
import type { DisasterEvent } from '../types/event';

/* Questo modulo simula una chiamata API per ottenere eventi climatici estremi. In un'applicazione reale, questa funzione farebbe una richiesta HTTP a un backend
Per questa demo, restituisce un set di dati statico dopo un breve ritardo per simulare la latenza di rete.
La funzione accetta un AbortSignal per consentire l'annullamento della richiesta, ad esempio se l'utente cambia pagina o aggiorna i filtri prima che la risposta arrivi.
Se la richiesta viene annullata, la funzione rigetta con un DOMException di tipo 'AbortError'.
*/

export async function getEvents(signal?: AbortSignal): Promise<DisasterEvent[]> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      if (signal?.aborted) {
        reject(new DOMException('Richiesta annullata.', 'AbortError'));
        return;
      }

      resolve(mockEvents);
    }, 250);

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
