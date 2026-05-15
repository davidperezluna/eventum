import { Injectable } from '@angular/core';
import { Usuario } from '../types/entities';

/**
 * Sincroniza identidad con OneSignal v16 tras login: External ID = Supabase Auth `user.id`,
 * más email y SMS (E.164) desde el perfil en `usuarios`.
 */
@Injectable({
  providedIn: 'root'
})
export class OneSignalIdentityService {
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
    const email = (usuario.email || authEmail || '').trim();
    const phoneRaw = usuario.telefono;
    this.runWithOneSignal(async (OneSignal) => {
      await OneSignal.login(authUserId);
      if (email) {
        await OneSignal.User.addEmail(email);
      }
      const e164 = this.normalizePhoneE164(phoneRaw);
      if (e164) {
        await OneSignal.User.addSms(e164);
      }
    });
  }

  logoutFromOneSignal(): void {
    this.runWithOneSignal(async (OneSignal) => {
      await OneSignal.logout();
    });
  }

  private runWithOneSignal(fn: (oneSignal: any) => Promise<void>): void {
    const w = window as Window & {
      OneSignalDeferred?: Array<(o: any) => void | Promise<void>>;
      __eventumOneSignal?: any;
    };

    const run = (OneSignal: any) => {
      void fn(OneSignal).catch((e) => console.warn('[OneSignal] identity:', e));
    };

    if (w.__eventumOneSignal) {
      run(w.__eventumOneSignal);
      return;
    }
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
