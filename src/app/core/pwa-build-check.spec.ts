import { afterEach, describe, expect, it, vi } from 'vitest';
import { claimReload, isAutomaticUpdateRoute, isPaymentRoute, loadedBuildId, parsePublishedBuild, fetchPublishedBuild } from './pwa-build-check';

const build = 'a'.repeat(64);
afterEach(() => { vi.unstubAllGlobals(); document.head.innerHTML = ''; sessionStorage.clear(); });

describe('PWA update safeguards', () => {
  it('reads the running HTML rather than a shared last-seen build', () => {
    localStorage.setItem('eventum-ngsw-build', 'new-remote-build');
    document.head.innerHTML = `<meta name="eventum-build" content="${build}">`;
    expect(loadedBuildId()).toBe(build);
    localStorage.clear();
  });
  it('rejects HTML fallback responses and malformed manifests', () => {
    for (const value of [null, '<html>404</html>', {}, { appData: { buildId: 2 } }]) {
      expect(parsePublishedBuild(value)).toBeNull();
    }
    expect(parsePublishedBuild({ appData: { buildId: build } })).toBe(build);
  });
  it('never automatically reloads checkout, forms, event QR pages or the reader', () => {
    for (const url of ['/carrito', '/carrito/agregar/1/boleta', '/pago-wompi?id=x', '/pago-resultado?id=x', '/perfil', '/mis-compras/evento/4', '/lector/validar', '/cupos']) {
      expect(isAutomaticUpdateRoute(url)).toBe(false);
    }
    expect(isAutomaticUpdateRoute('/ayuda?x=1')).toBe(true);
    expect(isAutomaticUpdateRoute('/eventos-cliente')).toBe(true);
    expect(isPaymentRoute('/pago-resultado-producto?id=x')).toBe(true);
    expect(isPaymentRoute('/carrito/agregar/1/producto')).toBe(true);
  });
  it('bounds retries when a CDN serves the same stale build', () => {
    expect(claimReload(build, 1000)).toBe(true);
    expect(claimReload(build, 2000)).toBe(false);
    expect(claimReload(build, 302000)).toBe(true);
  });
  it('bypasses browser and Angular cache and respects a project base href', async () => {
    document.head.innerHTML = '<base href="/eventum/">';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ appData: { buildId: build } }) });
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchPublishedBuild()).toBe(build);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url.pathname).toBe('/eventum/ngsw.json');
    expect(url.searchParams.get('ngsw-bypass')).toBe('true');
    expect(options.cache).toBe('no-store');
  });
  it('keeps the app open on network or JSON errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await fetchPublishedBuild()).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error('HTML response'); } }));
    expect(await fetchPublishedBuild()).toBeNull();
  });
});
