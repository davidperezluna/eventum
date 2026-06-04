import { DestroyRef, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter, interval } from 'rxjs';
import { environment } from '../../environments/environment';
import { AlertService } from './alert.service';

const DEFAULT_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_RESUME_AUTO_RELOAD_WINDOW_MS = 60_000;

/**
 * Detecta builds nuevos del service worker (ngsw) y recarga la app.
 * La actualización es obligatoria: no se puede posponer.
 * Al volver de segundo plano recarga en silencio; en primer plano muestra aviso y recarga.
 */
@Injectable({ providedIn: 'root' })
export class PwaUpdateService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly swUpdate = inject(SwUpdate);
  private readonly alertService = inject(AlertService);
  private readonly destroyRef = inject(DestroyRef);

  private updating = false;
  private wasHidden = false;
  /** True tras volver de background; habilita recarga silenciosa si llega VERSION_READY. */
  private resumedFromBackground = false;
  private resumeWindowTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly checkIntervalMs =
    environment.pwa?.updateCheckIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
  private readonly autoReloadOnResume = environment.pwa?.autoReloadOnResume !== false;
  private readonly resumeAutoReloadWindowMs =
    environment.pwa?.resumeAutoReloadWindowMs ?? DEFAULT_RESUME_AUTO_RELOAD_WINDOW_MS;

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
      this.clearResumeWindow();
    });
  }

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') {
      this.wasHidden = true;
      this.clearResumeWindow();
      return;
    }

    if (document.visibilityState === 'visible') {
      if (this.wasHidden) {
        this.wasHidden = false;
        this.markResumedFromBackground();
      }
      void this.safeCheckForUpdate();
    }
  };

  private markResumedFromBackground(): void {
    if (!this.autoReloadOnResume) return;
    this.resumedFromBackground = true;
    this.clearResumeWindow();
    this.resumeWindowTimer = setTimeout(() => {
      this.resumedFromBackground = false;
      this.resumeWindowTimer = null;
    }, this.resumeAutoReloadWindowMs);
  }

  private clearResumeWindow(): void {
    this.resumedFromBackground = false;
    if (this.resumeWindowTimer !== null) {
      clearTimeout(this.resumeWindowTimer);
      this.resumeWindowTimer = null;
    }
  }

  private async onVersionReady(): Promise<void> {
    if (this.updating) return;

    const silentReload = this.autoReloadOnResume && this.resumedFromBackground;
    this.clearResumeWindow();
    this.updating = true;

    try {
      if (!silentReload) {
        this.alertService.loading('Actualización obligatoria. Aplicando la nueva versión…');
      }
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
