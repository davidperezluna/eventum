import {
  Component,
  OnDestroy,
  inject,
  PLATFORM_ID,
  signal,
  NgZone,
} from '@angular/core';
import { isPlatformBrowser, DOCUMENT } from '@angular/common';

/** Evento no estándar soportado por Chromium para instalación PWA. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_INSTALL_KEY = 'eventum-pwa-install-banner-dismissed';
const DISMISS_INSECURE_KEY = 'eventum-pwa-insecure-hint-dismissed';

type PwaBannerMode = 'none' | 'install' | 'insecure';

@Component({
  selector: 'app-pwa-install-banner',
  standalone: true,
  templateUrl: './pwa-install-banner.html',
  styleUrl: './pwa-install-banner.css',
})
export class PwaInstallBanner implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly doc = inject(DOCUMENT);
  private readonly zone = inject(NgZone);

  /** `install`: botón nativo. `insecure`: http + IP (no permite instalar PWA en Chromium). */
  protected readonly bannerMode = signal<PwaBannerMode>('none');

  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private beforeInstallListener?: (e: Event) => void;
  private appInstalledListener?: () => void;

  constructor() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const win = this.doc.defaultView;
    if (!win) {
      return;
    }
    if (this.isStandalone(win)) {
      return;
    }

    // Red local por HTTP: no hay contexto seguro → no existe `beforeinstallprompt`.
    if (!win.isSecureContext) {
      try {
        if (win.localStorage.getItem(DISMISS_INSECURE_KEY) === '1') {
          return;
        }
      } catch {
        /* ignore */
      }
      this.zone.run(() => this.bannerMode.set('insecure'));
      return;
    }

    try {
      if (win.localStorage.getItem(DISMISS_INSTALL_KEY) === '1') {
        return;
      }
    } catch {
      /* private mode u bloqueo de storage */
    }

    this.beforeInstallListener = (e: Event) => {
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.zone.run(() => this.bannerMode.set('install'));
    };
    win.addEventListener('beforeinstallprompt', this.beforeInstallListener);

    this.appInstalledListener = () => {
      this.deferredPrompt = null;
      this.zone.run(() => this.bannerMode.set('none'));
      try {
        win.localStorage.setItem(DISMISS_INSTALL_KEY, '1');
      } catch {
        /* ignore */
      }
    };
    win.addEventListener('appinstalled', this.appInstalledListener);
  }

  ngOnDestroy(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const win = this.doc.defaultView;
    if (!win) {
      return;
    }
    if (this.beforeInstallListener) {
      win.removeEventListener('beforeinstallprompt', this.beforeInstallListener);
    }
    if (this.appInstalledListener) {
      win.removeEventListener('appinstalled', this.appInstalledListener);
    }
  }

  protected async onInstall(): Promise<void> {
    const prompt = this.deferredPrompt;
    if (!prompt) {
      return;
    }
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      /* usuario canceló o el navegador rechazó */
    }
    this.deferredPrompt = null;
    this.bannerMode.set('none');
  }

  protected onDismissInstall(): void {
    const win = this.doc.defaultView;
    try {
      win?.localStorage.setItem(DISMISS_INSTALL_KEY, '1');
    } catch {
      /* ignore */
    }
    this.bannerMode.set('none');
  }

  protected onDismissInsecure(): void {
    const win = this.doc.defaultView;
    try {
      win?.localStorage.setItem(DISMISS_INSECURE_KEY, '1');
    } catch {
      /* ignore */
    }
    this.bannerMode.set('none');
  }

  private isStandalone(win: Window): boolean {
    return (
      win.matchMedia('(display-mode: standalone)').matches ||
      (win.navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  }
}
