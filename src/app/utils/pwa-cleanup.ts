import { environment } from '../../environments/environment';

const CLEANUP_SESSION_KEY = 'eventum-ngsw-cleanup-reload';

/** Solo desregistra el service worker de Angular (ngsw), no el de OneSignal. */
function isAngularNgswRegistration(scriptUrl: string): boolean {
  return /\/ngsw-worker\.js(\?|$)/.test(scriptUrl);
}

async function clearNgswCaches(): Promise<void> {
  if (typeof caches === 'undefined') return;
  const names = await caches.keys();
  await Promise.all(
    names.filter((name) => name.startsWith('ngsw:')).map((name) => caches.delete(name)),
  );
}

/**
 * En staging/dev (`production: false`) elimina un ngsw-worker residual que
 * intercepta F5 y sirve builds viejos. OneSignal queda intacto.
 * Si hubo limpieza, recarga una vez (evita bucle con sessionStorage).
 */
export async function cleanupStaleAngularServiceWorker(): Promise<void> {
  if (environment.production) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  const ngswRegs = registrations.filter((reg) => {
    const scriptUrl =
      reg.active?.scriptURL ?? reg.installing?.scriptURL ?? reg.waiting?.scriptURL ?? '';
    return scriptUrl && isAngularNgswRegistration(scriptUrl);
  });

  if (ngswRegs.length === 0) return;

  await Promise.all(ngswRegs.map((reg) => reg.unregister()));
  await clearNgswCaches();

  console.info(
    `[PWA] ${ngswRegs.length} service worker(s) ngsw desregistrado(s) en entorno no-producción.`,
  );

  if (!sessionStorage.getItem(CLEANUP_SESSION_KEY)) {
    sessionStorage.setItem(CLEANUP_SESSION_KEY, '1');
    location.reload();
  }
}
