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
/** Solo aviso push/PWA en iPhone iPad Safari; llave aparte para no ocultarlo al cerrar el banner de escritorio Chrome. */
const IOS_PWA_HINT_DISMISS_KEY = 'eventum-ios-pwa-push-hint-dismissed';

type BannerMode = 'hidden' | 'install' | 'info' | 'ios';

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

  protected readonly mode = signal<BannerMode>('hidden');
  /** URL sugerida cuando la página se abre por IP HTTP (mismo puerto que el origen actual). */
  protected readonly localhostHint = signal('http://localhost:8080');

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

    let chromeBannerDismissed = false;
    let iosHintDismissed = false;
    try {
      chromeBannerDismissed = win.localStorage.getItem(DISMISS_KEY) === '1';
      iosHintDismissed = win.localStorage.getItem(IOS_PWA_HINT_DISMISS_KEY) === '1';
    } catch {
      /* private mode u bloqueo de storage */
    }

    const port = win.location.port;
    this.localhostHint.set(port ? `http://localhost:${port}` : 'http://localhost');

    const ios = this.isIosDevice(win);

    // iOS (Safari y otros): las notificaciones push web solo están disponibles tras agregar la app al inicio.
    if (ios && win.isSecureContext && !iosHintDismissed) {
      this.zone.run(() => this.mode.set('ios'));
    }
    // HTTP por IP (p. ej. 192.168.x.x): no hay contexto seguro → no llega beforeinstallprompt.
    else if (!win.isSecureContext && !chromeBannerDismissed) {
      this.zone.run(() => this.mode.set('info'));
    }

    if (chromeBannerDismissed) {
      return;
    }

    this.beforeInstallListener = (e: Event) => {
      if (this.isIosDevice(win)) {
        return;
      }
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.zone.run(() => this.mode.set('install'));
    };
    win.addEventListener('beforeinstallprompt', this.beforeInstallListener);

    this.appInstalledListener = () => {
      this.deferredPrompt = null;
      this.zone.run(() => this.mode.set('hidden'));
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
    this.mode.set('hidden');
  }

  protected onDismiss(): void {
    const win = this.doc.defaultView;
    const current = this.mode();
    try {
      if (current === 'ios') {
        win?.localStorage.setItem(IOS_PWA_HINT_DISMISS_KEY, '1');
      } else {
        win?.localStorage.setItem(DISMISS_KEY, '1');
      }
    } catch {
      /* ignore */
    }
    this.mode.set('hidden');
  }

  private isStandalone(win: Window): boolean {
    return (
      win.matchMedia('(display-mode: standalone)').matches ||
      (win.navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  }

  /** iPhone, iPod, iPad o iPad OS con user agent “Mac” y touch. */
  private isIosDevice(win: Window): boolean {
    const ua = typeof win.navigator !== 'undefined' ? win.navigator.userAgent || '' : '';
    const maxTouchPoints = win.navigator.maxTouchPoints ?? 0;
    return (
      /iPad|iPhone|iPod/.test(ua) ||
      (win.navigator.platform === 'MacIntel' && maxTouchPoints > 1)
    );
  }
}
