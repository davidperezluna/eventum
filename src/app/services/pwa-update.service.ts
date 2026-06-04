import { DestroyRef, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter, interval } from 'rxjs';
import { environment } from '../../environments/environment';

const DEFAULT_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Detecta builds nuevos del service worker (ngsw) y recarga la app en silencio.
 * Actualización obligatoria (sin posponer), sin overlay — Android e iOS PWA.
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
      .subscribe(() => void this.onVersionReady());

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
      await this.forceReload();
    } finally {
      this.updating = false;
    }
  }

  private async safeCheckForUpdate(): Promise<void> {
    try {
      await this.swUpdate.checkForUpdate();
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
