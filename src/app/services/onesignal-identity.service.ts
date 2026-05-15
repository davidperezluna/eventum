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
      await this.waitForExternalId(OneSignal, authUserId, 8000);

      // Si el panel o la config activan "requiere consentimiento", addEmail/addSms se ignoran
      // hasta tener consentimiento (el SDK bloquea con "Consent required but not given").
      // Usuario ya autenticado en Supabase = consentimiento para vincular datos de perfil.
      if (typeof OneSignal.setConsentGiven === 'function') {
        await OneSignal.setConsentGiven(true);
      }

      if (email) {
        // addEmail en web suele encolar la operación: el await no garantiza respuesta HTTP.
        // Reintento tras 2s ayuda con carreras; los tags sirven como respaldo visible en el panel.
        await this.tryAddEmailAndTags(OneSignal, email);
        await new Promise((r) => setTimeout(r, 2000));
        await this.tryAddEmailAndTags(OneSignal, email);
        console.info(
          '[OneSignal] email y tags encolados para OneSignal (revisá pestaña Red: api.onesignal.com). ',
          'Si el listado sigue vacío: Settings → Keys & IDs → Identity verification (JWT) o email duplicado en otra fila.'
        );
      }
      const e164 = this.normalizePhoneE164(phoneRaw);
      if (e164) {
        try {
          await OneSignal.User.addSms(e164);
        } catch (e) {
          console.warn('[OneSignal] addSms:', e);
        }
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

  private async tryAddEmailAndTags(oneSignal: any, email: string): Promise<void> {
    try {
      await oneSignal.User.addEmail(email);
    } catch (e) {
      console.warn('[OneSignal] addEmail:', e);
    }
    try {
      oneSignal.User.addTags?.({
        supabase_email: email,
      });
    } catch (e) {
      console.warn('[OneSignal] addTags:', e);
    }
  }

  /** Tras `login()`, el External ID en cliente puede aplicarse un tick después. */
  private async waitForExternalId(oneSignal: any, expected: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        if (oneSignal.User?.externalId === expected) {
          return;
        }
      } catch {
        /* ignore */
      }
      await new Promise((r) => setTimeout(r, 50));
    }
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
