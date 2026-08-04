import { DestroyRef, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter, interval } from 'rxjs';
import { environment } from '../../environments/environment';

const DEFAULT_CHECK_INTERVAL_MS = 60 * 1000;
const INIT_RECHECK_DELAYS_MS = [2_000, 8_000, 20_000, 45_000];

/**
 * Detecta builds nuevos del service worker (ngsw) en producción, activa la
 * actualización y recarga la app. Comprueba al iniciar, al volver a la pestaña,
 * al recuperar foco y de forma periódica (Safari/iOS PWA suele cachear agresivo).
 */
@Injectable({ providedIn: 'root' })
export class PwaUpdateService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly swUpdate = inject(SwUpdate);
  private readonly destroyRef = inject(DestroyRef);

  private updating = false;

  private readonly checkIntervalMs =
    environment.pwa?.updateCheckIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;

  init(): void {
    if (!isPlatformBrowser(this.platformId) || !this.swUpdate.isEnabled) {
      return;
    }

    this.swUpdate.versionUpdates
      .pipe(
        filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((evt) => {
        console.info('[PWA] Nueva versión disponible:', evt.latestVersion.hash);
        void this.onVersionReady();
      });

    this.swUpdate.unrecoverable.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      console.error('[PWA] Estado irrecuperable del service worker:', event.reason);
      void this.forceReload();
    });

    void this.safeCheckForUpdate();
    for (const delayMs of INIT_RECHECK_DELAYS_MS) {
      window.setTimeout(() => void this.safeCheckForUpdate(), delayMs);
    }

    interval(this.checkIntervalMs)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.safeCheckForUpdate());

    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('focus', this.onWindowFocus);
    window.addEventListener('pageshow', this.onPageShow);

    this.destroyRef.onDestroy(() => {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      window.removeEventListener('focus', this.onWindowFocus);
      window.removeEventListener('pageshow', this.onPageShow);
    });
  }

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      void this.safeCheckForUpdate();
    }
  };

  private readonly onWindowFocus = (): void => {
    void this.safeCheckForUpdate();
  };

  private readonly onPageShow = (event: PageTransitionEvent): void => {
    if (event.persisted) {
      void this.safeCheckForUpdate();
    }
  };

  private async onVersionReady(): Promise<void> {
    if (this.updating) {
      return;
    }
    this.updating = true;
    try {
      await this.forceReload();
    } finally {
      this.updating = false;
    }
  }

  private async safeCheckForUpdate(): Promise<void> {
    try {
      const hasUpdate = await this.swUpdate.checkForUpdate();
      if (hasUpdate) {
        console.info('[PWA] checkForUpdate: hay una versión pendiente de activar.');
      }
    } catch (err) {
      console.warn('[PWA] checkForUpdate:', err);
    }
  }

  private async forceReload(): Promise<void> {
    try {
      await this.swUpdate.activateUpdate();
    } catch (err) {
      console.warn('[PWA] activateUpdate:', err);
    }
    window.location.reload();
  }
}
