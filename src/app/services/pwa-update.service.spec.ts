import '@angular/compiler';
import { getTestBed, TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { Subject } from 'rxjs';
import { SwUpdate } from '@angular/service-worker';
import { NavigationEnd, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaUpdateService } from './pwa-update.service';
import * as buildCheck from '../core/pwa-build-check';

vi.mock('../../environments/environment', () => ({ environment: { production: true, pwa: { serviceWorkerEnabled: true, updateCheckIntervalMs: 30000 } } }));
vi.mock('../core/pwa-build-check', async importOriginal => ({
  ...await importOriginal<typeof import('../core/pwa-build-check')>(),
  fetchPublishedBuild: vi.fn(), reloadForBuild: vi.fn(),
}));
if (!getTestBed().platform) TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
const oldBuild = 'a'.repeat(64);
const newBuild = 'b'.repeat(64);
let events: Subject<any>;
let navigation: Subject<any>;
let unrecoverable: Subject<any>;
let router: { url: string; events: Subject<any> };
let check: ReturnType<typeof vi.fn>;
let service: PwaUpdateService;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  sessionStorage.clear();
  document.head.innerHTML = `<meta name="eventum-build" content="${oldBuild}">`;
  document.body.innerHTML = '';
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { controller: {} } });
  events = new Subject(); navigation = new Subject(); unrecoverable = new Subject();
  router = { url: '/ayuda', events: navigation };
  check = vi.fn().mockResolvedValue(false);
  vi.mocked(buildCheck.fetchPublishedBuild).mockResolvedValue(newBuild);
  TestBed.configureTestingModule({ providers: [PwaUpdateService,
    { provide: Router, useValue: router },
    { provide: SwUpdate, useValue: { isEnabled: true, versionUpdates: events, unrecoverable, checkForUpdate: check } },
  ] });
  service = TestBed.inject(PwaUpdateService);
});
afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); });
function ready() {
  events.next({ type: 'VERSION_READY', currentVersion: { hash: 'old', appData: { buildId: oldBuild } }, latestVersion: { hash: 'new', appData: { buildId: newBuild } } });
}

describe('PWA update coordinator', () => {
  it('postpones the banner and automatic reloads until an explicit update', async () => {
    router.url = '/mis-compras'; service.init(); ready(); service.postpone();
    router.url = '/ayuda'; navigation.next(new NavigationEnd(1, '/ayuda', '/ayuda'));
    await vi.advanceTimersByTimeAsync(251);
    ready(); window.dispatchEvent(new Event('focus'));
    expect(service.postponed()).toBe(true);
    expect(buildCheck.reloadForBuild).not.toHaveBeenCalled();
    await service.applyUpdate();
    expect(buildCheck.reloadForBuild).toHaveBeenCalledOnce();
  });
  it('shows the loaded short version and reports a manual up-to-date check', async () => {
    service.init(); await vi.advanceTimersByTimeAsync(1);
    vi.mocked(buildCheck.fetchPublishedBuild).mockResolvedValue(oldBuild);
    await service.checkNow();
    expect(service.versionLabel).toBe('aaaaaaaa');
    expect(service.checkMessage()).toBe('Estás usando la última versión.');
    expect(buildCheck.reloadForBuild).not.toHaveBeenCalled();
  });
  it('shows a manual update result instead of automatically reloading Help', async () => {
    service.init(); await vi.advanceTimersByTimeAsync(1);
    check.mockImplementation(async () => { ready(); return true; });
    await service.checkNow();
    expect(service.available()).toBe(true);
    expect(service.checkingNow()).toBe(false);
    expect(service.checkMessage()).toContain('Nueva versión lista');
    expect(buildCheck.reloadForBuild).not.toHaveBeenCalled();
  });
  it('does not report success for offline or failed manual checks', async () => {
    service.init(); await vi.advanceTimersByTimeAsync(1);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    await service.checkNow(); expect(service.checkMessage()).toContain('Sin conexión');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    vi.mocked(buildCheck.fetchPublishedBuild).mockResolvedValue(null);
    await service.checkNow(); expect(service.checkMessage()).toContain('No pudimos');
  });
  it('waits for an installed version before reloading a browsing page', async () => {
    service.init();
    await vi.advanceTimersByTimeAsync(1);
    expect(check).toHaveBeenCalledOnce();
    expect(buildCheck.reloadForBuild).not.toHaveBeenCalled();
    ready();
    expect(buildCheck.reloadForBuild).toHaveBeenCalledWith(newBuild, false);
  });
  it('never reloads during payment, including explicit update requests', async () => {
    router.url = '/pago-resultado?id=payment';
    service.init(); ready(); await service.applyUpdate();
    expect(service.paymentActive()).toBe(true);
    expect(buildCheck.reloadForBuild).not.toHaveBeenCalled();
    router.url = '/ayuda'; navigation.next(new NavigationEnd(1, '/ayuda', '/ayuda'));
    await vi.advanceTimersByTimeAsync(251);
    expect(buildCheck.reloadForBuild).toHaveBeenCalledOnce();
  });
  it('preserves edits even after an input loses focus, while allowing an explicit update', async () => {
    service.init();
    document.dispatchEvent(new Event('input', { bubbles: true }));
    ready(); window.dispatchEvent(new Event('focus'));
    expect(buildCheck.reloadForBuild).not.toHaveBeenCalled();
    expect(service.available()).toBe(true);
    await service.applyUpdate();
    expect(buildCheck.reloadForBuild).toHaveBeenCalledOnce();
  });
  it('does not reload an open QR screen', () => {
    router.url = '/mis-compras/evento/5'; service.init(); ready();
    expect(buildCheck.reloadForBuild).not.toHaveBeenCalled();
  });
  it('keeps edit protection across query-only navigation', async () => {
    service.init();
    document.dispatchEvent(new Event('input', { bubbles: true }));
    ready();
    router.url = '/ayuda?q=entrada';
    navigation.next(new NavigationEnd(2, router.url, router.url));
    await vi.advanceTimersByTimeAsync(251);
    expect(buildCheck.reloadForBuild).not.toHaveBeenCalled();
  });
  it('bypasses only a broken worker without clearing caches', async () => {
    service.init();
    await vi.advanceTimersByTimeAsync(2500);
    unrecoverable.next({ reason: 'Missing cached chunk' });
    await vi.advanceTimersByTimeAsync(1);
    expect(buildCheck.reloadForBuild).toHaveBeenCalledWith(newBuild, true);
  });
  it('recovers checking after a worker command stops responding', async () => {
    check.mockImplementation(() => new Promise(() => {}));
    service.init();
    await vi.advanceTimersByTimeAsync(16000);
    check.mockResolvedValue(false);
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(1);
    expect(check).toHaveBeenCalledTimes(2);
    expect(buildCheck.reloadForBuild).not.toHaveBeenCalled();
  });
  it('does not reload when storage is blocked', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    service.init(); ready();
    expect(buildCheck.reloadForBuild).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it('detects a version installed by another tab using the actual running build', () => {
    service.init();
    events.next({ type: 'NO_NEW_VERSION_DETECTED', version: { appData: { buildId: newBuild } } });
    expect(buildCheck.reloadForBuild).toHaveBeenCalledWith(newBuild, false);
  });
  it('does not reload a hidden page or on installation failure', () => {
    service.init();
    events.next({ type: 'VERSION_INSTALLATION_FAILED', version: { hash: 'bad' }, error: 'hash mismatch' });
    expect(service.available()).toBe(false);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    ready(); expect(buildCheck.reloadForBuild).not.toHaveBeenCalled();
  });
  it('coalesces resume events and removes timers on destroy', async () => {
    service.init(); service.init();
    window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('pageshow'));
    await vi.advanceTimersByTimeAsync(1);
    expect(check).toHaveBeenCalledOnce();
    TestBed.resetTestingModule();
    await vi.advanceTimersByTimeAsync(60000);
    expect(check).toHaveBeenCalledOnce();
  });
});
