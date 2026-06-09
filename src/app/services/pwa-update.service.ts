import { DestroyRef, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter, interval } from 'rxjs';
import { environment } from '../../environments/environment';

const DEFAULT_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const UPDATE_NOTIFY_MS = 1500;

/**
 * Detecta builds nuevos del service worker (ngsw) en producción, activa la
 * actualización y recarga la app. Comprueba al iniciar, al volver a la pestaña
 * y de forma periódica (útil en PWAs instaladas iOS/Android).
 */
@Injectable({ providedIn: 'root' })
export class PwaUpdateService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly swUpdate = inject(SwUpdate);
  private readonly destroyRef = inject(DestroyRef);

  private updating = false;

  private readonly checkIntervalMs =
    environment.pwa?.updateCheckIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;

  private readonly showUpdateNotification =
    environment.pwa?.showUpdateNotification ?? false;

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

    interval(this.checkIntervalMs)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.safeCheckForUpdate());

    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    });
  }

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      void this.safeCheckForUpdate();
    }
  };

  private async onVersionReady(): Promise<void> {
    if (this.updating) return;
    this.updating = true;
    try {
      if (this.showUpdateNotification) {
        this.notifyUpdateAvailable();
        await this.delay(UPDATE_NOTIFY_MS);
      }
      await this.forceReload();
    } finally {
      this.updating = false;
    }
  }

  private notifyUpdateAvailable(): void {
    if (typeof document === 'undefined') return;
    const banner = document.createElement('div');
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.textContent = 'Actualizando a la última versión…';
    Object.assign(banner.style, {
      position: 'fixed',
      bottom: '1rem',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '10000',
      padding: '0.75rem 1.25rem',
      borderRadius: '8px',
      background: '#1e293b',
      color: '#f8fafc',
      fontSize: '0.875rem',
      boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
    });
    document.body.appendChild(banner);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
    location.reload();
  }
}
