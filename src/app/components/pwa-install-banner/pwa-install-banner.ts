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

const DISMISS_KEY = 'eventum-pwa-install-banner-dismissed';

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

  protected readonly visible = signal(false);

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
    try {
      if (win.localStorage.getItem(DISMISS_KEY) === '1') {
        return;
      }
    } catch {
      /* private mode u bloqueo de storage */
    }

    this.beforeInstallListener = (e: Event) => {
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.zone.run(() => this.visible.set(true));
    };
    win.addEventListener('beforeinstallprompt', this.beforeInstallListener);

    this.appInstalledListener = () => {
      this.deferredPrompt = null;
      this.zone.run(() => this.visible.set(false));
      try {
        win.localStorage.setItem(DISMISS_KEY, '1');
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
    this.visible.set(false);
  }

  protected onDismiss(): void {
    const win = this.doc.defaultView;
    try {
      win?.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    this.visible.set(false);
  }

  private isStandalone(win: Window): boolean {
    return (
      win.matchMedia('(display-mode: standalone)').matches ||
      (win.navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  }
}
