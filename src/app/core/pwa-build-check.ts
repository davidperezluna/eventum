const BUILD_KEY = 'eventum-ngsw-build';
const RELOAD_KEY = 'eventum-ngsw-reload';

export function simpleNgswHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return String(hash);
}

export function isAppleWebKitBrowser(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent || '';
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari =
    /Safari\//.test(ua) &&
    !/Chrome\//.test(ua) &&
    !/CriOS\//.test(ua) &&
    !/FxiOS\//.test(ua);
  return isIOS || isSafari;
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Respeta `<base href>` (GitHub Pages project site o dominio propio en raíz). */
export function getAppBaseHref(): string {
  if (typeof document === 'undefined') {
    return '/';
  }
  const href = document.querySelector('base')?.getAttribute('href')?.trim() || '/';
  if (href === '/') {
    return '/';
  }
  const normalized = href.startsWith('/') ? href : `/${href}`;
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

export function resolveAppAssetUrl(relativePath: string): string {
  const base = getAppBaseHref();
  const path = relativePath.replace(/^\//, '');
  if (base === '/') {
    return `/${path}`;
  }
  return `${base}${path}`;
}

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // Modo privado / storage bloqueado.
    }
  }
}

function fetchViaXhr(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.setRequestHeader('Cache-Control', 'no-cache');
      xhr.setRequestHeader('Pragma', 'no-cache');
      xhr.onload = () => {
        resolve(xhr.status >= 200 && xhr.status < 300 ? xhr.responseText : null);
      };
      xhr.onerror = () => resolve(null);
      xhr.send();
    } catch {
      resolve(null);
    }
  });
}

export async function fetchFreshNgswManifest(): Promise<string | null> {
  const url = `${resolveAppAssetUrl('ngsw.json')}?_=${Date.now()}`;

  try {
    const response = await fetch(url, {
      cache: 'reload',
      credentials: 'same-origin',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });
    if (response.ok) {
      return await response.text();
    }
  } catch {
    // Safari a veces falla fetch con cache modes estrictos.
  }

  return fetchViaXhr(url);
}

export async function checkNgswBuildChanged(): Promise<boolean> {
  const body = await fetchFreshNgswManifest();
  if (!body) {
    return false;
  }

  const hash = simpleNgswHash(body);
  const previous = readStored(BUILD_KEY);

  if (previous && previous !== hash) {
    writeStored(BUILD_KEY, hash);
    if (readStored(RELOAD_KEY) === hash) {
      return false;
    }
    writeStored(RELOAD_KEY, hash);
    return true;
  }

  if (!previous) {
    writeStored(BUILD_KEY, hash);
  }

  return false;
}

export async function clearNgswCachesAndUnregister(): Promise<void> {
  const tasks: Promise<unknown>[] = [];

  if (typeof caches !== 'undefined') {
    tasks.push(
      caches.keys().then((names) =>
        Promise.all(names.filter((name) => name.startsWith('ngsw:')).map((name) => caches.delete(name))),
      ),
    );
  }

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    tasks.push(
      navigator.serviceWorker.getRegistrations().then((registrations) =>
        Promise.all(
          registrations
            .filter((registration) => {
              const scriptUrl =
                registration.active?.scriptURL ??
                registration.waiting?.scriptURL ??
                registration.installing?.scriptURL ??
                '';
              return /ngsw-worker\.js/.test(scriptUrl);
            })
            .map((registration) => registration.unregister()),
        ),
      ),
    );
  }

  await Promise.all(tasks);
}

/** Recarga forzada evitando caché de disco en Safari/iOS. */
export function hardReloadForSafari(): void {
  const url = new URL(window.location.href);
  url.searchParams.set('_nc', String(Date.now()));
  window.location.replace(url.toString());
}

export async function clearNgswAndHardReload(): Promise<void> {
  await clearNgswCachesAndUnregister();
  hardReloadForSafari();
}
