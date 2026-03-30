import { useEffect, useState } from 'react';

type GoogleMapStatus = 'loading' | 'ready' | 'missing-key' | 'error';

interface UseGoogleMapResult {
  status: GoogleMapStatus;
  error: string | null;
}

declare global {
  interface Window {
    google?: typeof google;
    __climatePulseGoogleMapsPromise?: Promise<void>;
  }
}

function hasImportLibrary(): boolean {
  const googleMaps = (window.google as unknown as { maps?: { importLibrary?: unknown } } | undefined)?.maps;
  return typeof googleMaps?.importLibrary === 'function';
}

function waitForImportLibrary(timeoutMs = 5_000): Promise<void> {
  const startTime = window.performance.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      if (hasImportLibrary()) {
        resolve();
        return;
      }

      if (window.performance.now() - startTime >= timeoutMs) {
        reject(
          new Error(
            'Google Maps e stato caricato ma importLibrary non e disponibile. Verifica estensioni che bloccano script o la configurazione della chiave API.'
          )
        );
        return;
      }

      window.setTimeout(check, 50);
    };

    check();
  });
}

function loadGoogleMapsScript(apiKey: string, mapId?: string): Promise<void> {
  if (hasImportLibrary()) {
    return Promise.resolve();
  }

  if (window.__climatePulseGoogleMapsPromise) {
    return window.__climatePulseGoogleMapsPromise;
  }

  window.__climatePulseGoogleMapsPromise = new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      key: apiKey,
      v: 'weekly',
      loading: 'async',
      libraries: 'maps,marker',
    });

    if (mapId) {
      params.set('map_ids', mapId);
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      waitForImportLibrary().then(resolve).catch(reject);
    };
    script.onerror = () => reject(new Error('Caricamento Google Maps fallito.'));
    document.head.appendChild(script);
  });

  return window.__climatePulseGoogleMapsPromise;
}

export function useGoogleMap(apiKey?: string, mapId?: string): UseGoogleMapResult {
  const [status, setStatus] = useState<GoogleMapStatus>(apiKey ? 'loading' : 'missing-key');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiKey) {
      setStatus('missing-key');
      setError(null);
      return;
    }

    let cancelled = false;
    setStatus('loading');
    setError(null);

    loadGoogleMapsScript(apiKey, mapId)
      .then(async () => {
        await google.maps.importLibrary('maps');
        await google.maps.importLibrary('marker');

        if (!cancelled) {
          setStatus('ready');
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setStatus('error');
          setError(loadError instanceof Error ? loadError.message : 'Errore sconosciuto.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey, mapId]);

  return { status, error };
}
