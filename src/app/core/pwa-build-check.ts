/** Read the build that actually booted, not the last version fetched. */
export function loadedBuildId(): string | null {
  return document.querySelector<HTMLMetaElement>('meta[name="eventum-build"]')?.content || null;
}

export function parsePublishedBuild(body: unknown): string | null {
  const id = (body as { appData?: { buildId?: unknown } } | null)?.appData?.buildId;
  return typeof id === 'string' && /^[a-f0-9]{64}$/.test(id) ? id : null;
}

export async function fetchPublishedBuild(): Promise<string | null> {
  const url = new URL('ngsw.json', document.baseURI);
  url.searchParams.set('ngsw-bypass', 'true');
  url.searchParams.set('_', String(Date.now()));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
    });
    return response.ok ? parsePublishedBuild(await response.json()) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Only browsing pages can reload automatically; forms, payments and QR screens cannot. */
export function isAutomaticUpdateRoute(url: string): boolean {
  const path = url.split(/[?#]/)[0].replace(/\/$/, '') || '/';
  return ['/', '/eventos-cliente', '/ayuda', '/conocenos', '/organizadores', '/clubes'].includes(path);
}

export function isPaymentRoute(url: string): boolean {
  return /^\/(carrito(?:\/|$)|carrito-productos(?:\/|$)|pago-wompi(?:\/|$)|pago-resultado(?:-producto)?(?:\/|$))/.test(url.split(/[?#]/)[0]);
}

/** Bound retries if a CDN still returns old HTML. No automatic reload without storage. */
export function claimReload(build: string, now = Date.now()): boolean {
  try {
    const key = `eventum-update-attempt:${build}`;
    const previous = Number(sessionStorage.getItem(key));
    if (previous && now - previous < 5 * 60_000) return false;
    sessionStorage.setItem(key, String(now));
    return true;
  } catch {
    return false;
  }
}

export function reloadForBuild(build: string, bypassWorker = false): void {
  const url = new URL(window.location.href);
  url.searchParams.set('_nc', build);
  if (bypassWorker) url.searchParams.set('ngsw-bypass', 'true');
  window.location.replace(url.toString());
}
