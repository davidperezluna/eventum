import {
  Component,
  OnDestroy,
  inject,
  PLATFORM_ID,
  signal,
  NgZone,
} from '@angular/core';
import { isPlatformBrowser, DOCUMENT } from '@angular/common';
import { environment } from '../../../environments/environment';

/** Evento no estándar soportado por Chromium para instalación PWA. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Tras cerrar el aviso, no se muestra hasta pasado este tiempo. 1 día = puede volver a salir al día siguiente (24 h). */
const PWA_BANNER_SNOOZE_MS = 1 * 24 * 60 * 60 * 1000;

const LEGACY_CHROME_DISMISS_KEY = 'eventum-pwa-install-banner-dismissed';
const LEGACY_IOS_DISMISS_KEY = 'eventum-ios-pwa-push-hint-dismissed';

const CHROME_PWA_SNOOZE_UNTIL_KEY = 'eventum-chrome-pwa-banner-snooze-until';
const IOS_PWA_HINT_SNOOZE_UNTIL_KEY = 'eventum-ios-pwa-hint-snooze-until';
/** El usuario instaló la PWA desde Chrome/Edge → no insistir con el banner de escritorio. */
const PWA_CHROME_INSTALLED_KEY = 'eventum-pwa-chrome-installed';

type BannerMode = 'hidden' | 'install' | 'info' | 'ios';

function readSnoozeUntil(ls: Storage, key: string): number | null {
  try {
    const v = ls.getItem(key);
    if (!v) {
      return null;
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function isSnoozeActive(ls: Storage, key: string): boolean {
  const until = readSnoozeUntil(ls, key);
  return until != null && Date.now() < until;
}

function setSnoozeFromNow(ls: Storage, key: string, ms: number): void {
  ls.setItem(key, String(Date.now() + ms));
}

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

    let ls: Storage | null = null;
    try {
      ls = win.localStorage;
    } catch {
      ls = null;
    }

    if (ls) {
      this.migrateLegacyDismissKeys(ls);
    }

    let chromeInstalled = false;
    let chromeSnoozed = false;
    let iosSnoozed = false;
    if (ls) {
      try {
        chromeInstalled = ls.getItem(PWA_CHROME_INSTALLED_KEY) === '1';
        chromeSnoozed = isSnoozeActive(ls, CHROME_PWA_SNOOZE_UNTIL_KEY);
        iosSnoozed = isSnoozeActive(ls, IOS_PWA_HINT_SNOOZE_UNTIL_KEY);
      } catch {
        /* ignore */
      }
    }

    const chromeBannerSuppressed = chromeInstalled || chromeSnoozed;

    const port = win.location.port;
    this.localhostHint.set(port ? `http://localhost:${port}` : 'http://localhost');

    const ios = this.isIosDevice(win);
    const showIosStyleHintInChrome =
      !!environment.showPwaInstallHintBannerInChromeForTests &&
      !ios &&
      win.isSecureContext &&
      !iosSnoozed;

    // iOS real, o pruebas en Chrome (environment): mismo panel de texto (“instalar en dispositivo / notificaciones”).
    if (
      (ios && win.isSecureContext && !iosSnoozed) ||
      showIosStyleHintInChrome
    ) {
      this.zone.run(() => this.mode.set('ios'));
    } else if (!win.isSecureContext && !chromeBannerSuppressed) {
      // HTTP por IP (p. ej. 192.168.x.x): no hay contexto seguro → no llega beforeinstallprompt.
      this.zone.run(() => this.mode.set('info'));
    }

    if (chromeInstalled) {
      return;
    }
    if (chromeSnoozed) {
      return;
    }

    this.beforeInstallListener = (e: Event) => {
      if (this.isIosDevice(win)) {
        return;
      }
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.zone.run(() => {
        // En modo prueba Chrome siempre mantenemos el banner «ios»; no pisar por beforeinstallprompt.
        if (environment.showPwaInstallHintBannerInChromeForTests) {
          return;
        }
        this.mode.set('install');
      });
    };
    win.addEventListener('beforeinstallprompt', this.beforeInstallListener);

    this.appInstalledListener = () => {
      this.deferredPrompt = null;
      this.zone.run(() => this.mode.set('hidden'));
      try {
        const s = win.localStorage;
        s.setItem(PWA_CHROME_INSTALLED_KEY, '1');
        s.removeItem(CHROME_PWA_SNOOZE_UNTIL_KEY);
        s.removeItem(LEGACY_CHROME_DISMISS_KEY);
      } catch {
        /* ignore */
      }
    };
    win.addEventListener('appinstalled', this.appInstalledListener);
  }

  /** Antes el cierre era permanente; ahora pasa a snooze para no ser invasivos. */
  private migrateLegacyDismissKeys(ls: Storage): void {
    try {
      if (ls.getItem(LEGACY_IOS_DISMISS_KEY) === '1') {
        ls.removeItem(LEGACY_IOS_DISMISS_KEY);
        if (!isSnoozeActive(ls, IOS_PWA_HINT_SNOOZE_UNTIL_KEY)) {
          setSnoozeFromNow(ls, IOS_PWA_HINT_SNOOZE_UNTIL_KEY, PWA_BANNER_SNOOZE_MS);
        }
      }
      if (
        ls.getItem(LEGACY_CHROME_DISMISS_KEY) === '1' &&
        ls.getItem(PWA_CHROME_INSTALLED_KEY) !== '1'
      ) {
        ls.removeItem(LEGACY_CHROME_DISMISS_KEY);
        if (!isSnoozeActive(ls, CHROME_PWA_SNOOZE_UNTIL_KEY)) {
          setSnoozeFromNow(ls, CHROME_PWA_SNOOZE_UNTIL_KEY, PWA_BANNER_SNOOZE_MS);
        }
      }
    } catch {
      /* ignore */
    }
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
      const ls = win?.localStorage;
      if (!ls) {
        this.mode.set('hidden');
        return;
      }
      if (current === 'ios') {
        setSnoozeFromNow(ls, IOS_PWA_HINT_SNOOZE_UNTIL_KEY, PWA_BANNER_SNOOZE_MS);
        ls.removeItem(LEGACY_IOS_DISMISS_KEY);
      } else {
        setSnoozeFromNow(ls, CHROME_PWA_SNOOZE_UNTIL_KEY, PWA_BANNER_SNOOZE_MS);
        ls.removeItem(LEGACY_CHROME_DISMISS_KEY);
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
