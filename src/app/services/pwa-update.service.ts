import { DestroyRef, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate } from '@angular/service-worker';
import { NavigationEnd, Router } from '@angular/router';
import { filter, interval } from 'rxjs';
import {
  claimReload, fetchPublishedBuild, isAutomaticUpdateRoute, isPaymentRoute,
  loadedBuildId, parsePublishedBuild, reloadForBuild,
} from '../core/pwa-build-check';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PwaUpdateService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly swUpdate = inject(SwUpdate);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  readonly available = signal(false);
  readonly paymentActive = signal(false);
  readonly reloading = signal(false);
  readonly postponed = signal(false);
  readonly checkingNow = signal(false);
  readonly checkMessage = signal('');

  get versionLabel(): string {
    const build = isPlatformBrowser(this.platformId) ? loadedBuildId() : null;
    return build ? build.slice(0, 8) : 'Desarrollo local';
  }

  postpone(): void {
    this.postponed.set(true);
  }

  async checkNow(): Promise<void> {
    if (this.checking || this.reloading()) return;
    if (!this.initialized) {
      this.checkMessage.set('La búsqueda de actualizaciones está disponible en producción.');
      return;
    }
    // A manual diagnosis must show its result instead of reloading the Help page.
    this.postponed.set(true);
    await this.check(true);
  }
  private initialized = false;
  private checking = false;
  private lastCheck = 0;
  private edited = false;
  private pendingBuild: string | null = null;
  private broken = false;
  private currentBuild: string | null = null;
  private currentPath = '';
  private timers = new Set<ReturnType<typeof setTimeout>>();

  init(): void {
    if (this.initialized || !isPlatformBrowser(this.platformId) || !environment.production ||
        !environment.pwa?.serviceWorkerEnabled) return;
    this.initialized = true;
    this.currentBuild = loadedBuildId();
    this.currentPath = this.router.url.split(/[?#]/)[0];
    // Remove our transient recovery parameter after boot so normal navigations use the worker again.
    const url = new URL(location.href);
    if (url.searchParams.has('_nc')) {
      url.searchParams.delete('_nc');
      url.searchParams.delete('ngsw-bypass');
      history.replaceState(history.state, '', url);
    }
    this.paymentActive.set(isPaymentRoute(this.router.url));
    this.swUpdate.versionUpdates.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(event => {
      if (event.type === 'VERSION_READY') {
        this.ready(parsePublishedBuild({ appData: event.latestVersion.appData }) ?? event.latestVersion.hash);
      } else if (event.type === 'NO_NEW_VERSION_DETECTED') {
        // The worker can already have installed the latest version for another tab.
        const build = parsePublishedBuild({ appData: event.version.appData });
        if (build && this.currentBuild && build !== this.currentBuild) this.ready(build);
      } else if (event.type === 'VERSION_INSTALLATION_FAILED') {
        console.warn('[PWA] Version installation failed', event);
      }
    });
    this.swUpdate.unrecoverable.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(event => {
      console.warn('[PWA] Recovery needed', event.reason);
      this.broken = true;
      void this.check();
    });
    this.router.events.pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const path = this.router.url.split(/[?#]/)[0];
        if (path !== this.currentPath) this.edited = false;
        this.currentPath = path;
        this.paymentActive.set(isPaymentRoute(this.router.url));
        this.later(() => { this.tryAutomaticReload(); void this.check(); }, 250);
      });
    document.addEventListener('input', this.onEdit, true);
    document.addEventListener('change', this.onEdit, true);
    document.addEventListener('visibilitychange', this.onResume);
    window.addEventListener('focus', this.onResume);
    window.addEventListener('pageshow', this.onResume);
    window.addEventListener('online', this.onResume);
    this.destroyRef.onDestroy(() => {
      for (const timer of this.timers) clearTimeout(timer);
      document.removeEventListener('input', this.onEdit, true);
      document.removeEventListener('change', this.onEdit, true);
      document.removeEventListener('visibilitychange', this.onResume);
      window.removeEventListener('focus', this.onResume);
      window.removeEventListener('pageshow', this.onResume);
      window.removeEventListener('online', this.onResume);
    });
    interval(environment.pwa.updateCheckIntervalMs ?? 30_000)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => void this.check());
    void this.check();
    this.later(() => void this.check(), 3000);
  }

  private later(action: () => void, delay: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (!this.destroyRef.destroyed) action();
    }, delay);
    this.timers.add(timer);
  }

  private readonly onEdit = (): void => { this.edited = true; };
  private readonly onResume = (): void => {
    if (document.visibilityState === 'visible') {
      this.tryAutomaticReload();
      void this.check();
    }
  };

  private ready(build: string): void {
    if (this.destroyRef.destroyed || (build === this.currentBuild && !this.broken)) return;
    this.pendingBuild = build;
    this.available.set(true);
    this.tryAutomaticReload();
  }

  private async check(manual = false): Promise<void> {
    if (manual && !navigator.onLine) {
      this.checkMessage.set('Sin conexión. Intenta de nuevo cuando tengas internet.');
      return;
    }
    if (this.checking || this.reloading() || document.visibilityState !== 'visible' || !navigator.onLine ||
        (!manual && Date.now() - this.lastCheck < 2000)) return;
    this.checking = true;
    this.checkingNow.set(true);
    if (manual) this.checkMessage.set('Buscando actualizaciones…');
    this.lastCheck = Date.now();
    try {
      const published = await fetchPublishedBuild();
      if (this.destroyRef.destroyed) return;
      if (!published) {
        if (manual) this.checkMessage.set('No pudimos comprobar la versión. Intenta de nuevo.');
        return;
      }
      if (this.broken) {
        this.ready(published);
      } else if (!navigator.serviceWorker?.controller) {
        // No controlling worker: a fresh navigation is enough; do not remove registrations.
        if (this.currentBuild && published !== this.currentBuild) this.ready(published);
      } else if (this.swUpdate.isEnabled) {
        // The worker validates and downloads a complete version before emitting VERSION_READY.
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            this.swUpdate.checkForUpdate(),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error('Service worker did not respond in time')), 15_000);
              this.timers.add(timer);
            }),
          ]);
        } finally {
          if (timer) {
            clearTimeout(timer);
            this.timers.delete(timer);
          }
        }
      }
      if (manual) {
        this.checkMessage.set(this.available()
          ? 'Nueva versión lista. Puedes actualizar cuando quieras.'
          : published === this.currentBuild
            ? 'Estás usando la última versión.'
            : 'Hay una nueva versión, pero aún no está lista. Intenta de nuevo en unos momentos.');
      }
    } catch (error) {
      console.warn('[PWA] Update check postponed', error);
      if (manual) this.checkMessage.set('No pudimos completar la búsqueda. Intenta de nuevo.');
    } finally {
      this.checking = false;
      this.checkingNow.set(false);
    }
  }

  private tryAutomaticReload(): void {
    if (this.postponed() || !isAutomaticUpdateRoute(this.router.url) || this.edited ||
        document.activeElement?.matches('input, textarea, select, [contenteditable]:not([contenteditable="false"])') ||
        document.querySelector('[role="dialog"], dialog[open], form.ng-dirty')) return;
    void this.applyUpdate();
  }

  /** Explicit click permits reloading other routes, but never an active payment or a hidden/offline page. */
  async applyUpdate(): Promise<void> {
    if (!this.pendingBuild || this.reloading() || isPaymentRoute(this.router.url) ||
        document.visibilityState !== 'visible' || !navigator.onLine) return;
    if (!claimReload(this.pendingBuild)) return;
    this.reloading.set(true);
    // A normal navigation switches to the installed version. No activateUpdate/chunk mismatch.
    // Recovery alone bypasses the worker, without deleting offline caches or OneSignal.
    reloadForBuild(this.pendingBuild, this.broken);
  }
}
