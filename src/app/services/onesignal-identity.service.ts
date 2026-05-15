import { Injectable } from '@angular/core';
import { Usuario } from '../types/entities';

/**
 * Sincroniza identidad con OneSignal v16: External ID = Supabase Auth `user.id`,
 * más email y SMS (E.164) desde el perfil.
 * Con sesión ya restaurada (F5), Supabase suele terminar antes que OneSignal;
 * se espera a que index.html complete `init` y asigne `window.__eventumOneSignal`.
 */
@Injectable({
  providedIn: 'root'
})
export class OneSignalIdentityService {
  private static readonly POLL_MS = 80;
  private static readonly WAIT_SDK_MS = 45000;

  /**
   * Normaliza teléfono a E.164 cuando el formato es reconocible; si no, no se envía SMS a OneSignal.
   */
  normalizePhoneE164(raw: string | undefined | null): string | null {
    if (raw == null || String(raw).trim() === '') {
      return null;
    }
    let s = String(raw).trim().replace(/[\s-]/g, '');
    if (s.startsWith('+')) {
      const digits = s.slice(1).replace(/\D/g, '');
      if (digits.length >= 8 && digits.length <= 15) {
        return '+' + digits;
      }
      return null;
    }
    const digits = s.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('57')) {
      return '+' + digits;
    }
    if (digits.length === 10 && /^3\d{9}$/.test(digits)) {
      return '+57' + digits;
    }
    return null;
  }

  syncLoggedInUser(authUserId: string, usuario: Usuario, authEmail?: string | null): void {
    void this.syncLoggedInUserWhenReady(authUserId, usuario, authEmail);
  }

  private async syncLoggedInUserWhenReady(
    authUserId: string,
    usuario: Usuario,
    authEmail?: string | null
  ): Promise<void> {
    const email = (usuario.email || authEmail || '').trim();
    const phoneRaw = usuario.telefono;

    let oneSignal = this.getOneSignalGlobal();
    if (!oneSignal) {
      oneSignal = await this.waitUntilOneSignalReady(OneSignalIdentityService.WAIT_SDK_MS);
    }

    const run = async (OneSignal: any) => {
      await OneSignal.login(authUserId);
      if (email) {
        await OneSignal.User.addEmail(email);
      }
      const e164 = this.normalizePhoneE164(phoneRaw);
      if (e164) {
        await OneSignal.User.addSms(e164);
      }
    };

    if (oneSignal) {
      try {
        await run(oneSignal);
      } catch (e) {
        console.warn('[OneSignal] sync:', e);
      }
      return;
    }

    this.runWithOneSignalDeferred(run);
  }

  private getOneSignalGlobal(): any {
    return (window as Window & { __eventumOneSignal?: any }).__eventumOneSignal;
  }

  private async waitUntilOneSignalReady(maxMs: number): Promise<any | null> {
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      const os = this.getOneSignalGlobal();
      if (os) {
        return os;
      }
      await new Promise((r) => setTimeout(r, OneSignalIdentityService.POLL_MS));
    }
    return null;
  }

  logoutFromOneSignal(): void {
    void this.logoutWhenReady();
  }

  private async logoutWhenReady(): Promise<void> {
    let oneSignal = this.getOneSignalGlobal();
    if (!oneSignal) {
      oneSignal = await this.waitUntilOneSignalReady(15000);
    }
    if (oneSignal) {
      try {
        await oneSignal.logout();
      } catch (e) {
        console.warn('[OneSignal] logout:', e);
      }
      return;
    }
    this.runWithOneSignalDeferred(async (OneSignal) => {
      await OneSignal.logout();
    });
  }

  /** Úsalo solo como respaldo si el SDK no llegó a exponer la instancia global. */
  private runWithOneSignalDeferred(fn: (oneSignal: any) => Promise<void>): void {
    const w = window as Window & {
      OneSignalDeferred?: Array<(o: any) => void | Promise<void>>;
    };

    w.OneSignalDeferred = w.OneSignalDeferred || [];
    w.OneSignalDeferred.push(async (OneSignal: any) => {
      try {
        await fn(OneSignal);
      } catch (e) {
        console.warn('[OneSignal] identity (deferred):', e);
      }
    });
  }
}
