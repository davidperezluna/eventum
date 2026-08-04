import { DestroyRef, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter, interval } from 'rxjs';
import {
  checkNgswBuildChanged,
  clearNgswAndHardReload,
  isAppleWebKitBrowser,
  isStandalonePwa,
} from '../core/pwa-build-check';
import { environment } from '../../environments/environment';

const DEFAULT_CHECK_INTERVAL_MS = 60 * 1000;
const APPLE_CHECK_INTERVAL_MS = 30 * 1000;
const STANDALONE_CHECK_INTERVAL_MS = 20 * 1000;
const INIT_RECHECK_DELAYS_MS = [1_000, 3_000, 8_000, 20_000, 45_000];

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
  private manifestChecking = false;

  private readonly isApple = isAppleWebKitBrowser();
  private readonly isStandalone = isStandalonePwa();

  private readonly checkIntervalMs =
    environment.pwa?.updateCheckIntervalMs ??
    (this.isStandalone
      ? STANDALONE_CHECK_INTERVAL_MS
      : this.isApple
        ? APPLE_CHECK_INTERVAL_MS
        : DEFAULT_CHECK_INTERVAL_MS);

  init(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    if (this.swUpdate.isEnabled) {
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
    }

    void this.safeManifestBuildCheck();
    for (const delayMs of INIT_RECHECK_DELAYS_MS) {
      window.setTimeout(() => void this.safeManifestBuildCheck(), delayMs);
    }

    interval(this.checkIntervalMs)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.safeManifestBuildCheck());

    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('focus', this.onWindowFocus);
    window.addEventListener('pageshow', this.onPageShow);
    window.addEventListener('online', this.onOnline);

    this.destroyRef.onDestroy(() => {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      window.removeEventListener('focus', this.onWindowFocus);
      window.removeEventListener('pageshow', this.onPageShow);
      window.removeEventListener('online', this.onOnline);
    });
  }

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      void this.safeCheckForUpdate();
      void this.safeManifestBuildCheck();
    }
  };

  private readonly onWindowFocus = (): void => {
    void this.safeCheckForUpdate();
    void this.safeManifestBuildCheck();
  };

  private readonly onPageShow = (event: PageTransitionEvent): void => {
    void this.safeCheckForUpdate();
    void this.safeManifestBuildCheck();
    if (event.persisted) {
      window.setTimeout(() => {
        void this.safeCheckForUpdate();
        void this.safeManifestBuildCheck();
      }, 500);
    }
  };

  private readonly onOnline = (): void => {
    void this.safeCheckForUpdate();
    void this.safeManifestBuildCheck();
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
    if (!this.swUpdate.isEnabled) {
      return;
    }
    try {
      const hasUpdate = await this.swUpdate.checkForUpdate();
      if (hasUpdate) {
        console.info('[PWA] checkForUpdate: hay una versión pendiente de activar.');
      }
    } catch (err) {
      console.warn('[PWA] checkForUpdate:', err);
    }
  }

  /** Fallback directo a ngsw.json: Safari/iOS a veces no dispara SwUpdate. */
  private async safeManifestBuildCheck(): Promise<void> {
    if (this.manifestChecking || this.updating) {
      return;
    }
    this.manifestChecking = true;
    try {
      const changed = await checkNgswBuildChanged();
      if (changed) {
        console.info('[PWA] ngsw.json cambió; limpiando caché y recargando (Safari/iOS).');
        this.updating = true;
        await clearNgswAndHardReload();
      }
    } catch (err) {
      console.warn('[PWA] manifest build check:', err);
    } finally {
      this.manifestChecking = false;
    }
  }

  private async forceReload(): Promise<void> {
    try {
      await this.swUpdate.activateUpdate();
    } catch (err) {
      console.warn('[PWA] activateUpdate:', err);
    }
    await clearNgswAndHardReload();
  }
}
