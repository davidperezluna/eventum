import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export type OneSignalEmailTargeting = 'email' | 'external_id';

export interface SendOneSignalTestEmailPayload {
  usuario_id?: number;
  email?: string;
  auth_user_id?: string;
  email_subject: string;
  email_body?: string;
  template_id?: string;
  targeting: OneSignalEmailTargeting;
}

export interface SendOneSignalTestEmailResult {
  success: boolean;
  onesignal_id?: string | null;
  recipients?: number | null;
  targeting?: OneSignalEmailTargeting;
  email?: string | null;
  external_id?: string | null;
  error?: string;
}

@Injectable({
  providedIn: 'root',
})
export class OneSignalEmailService {
  constructor(private supabase: SupabaseService) {}

  async sendTestEmail(payload: SendOneSignalTestEmailPayload): Promise<SendOneSignalTestEmailResult> {
    const {
      data: { session },
    } = await this.supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      throw new Error('Sesión expirada. Vuelve a iniciar sesión como administrador.');
    }

    const { data, error } = await this.supabase.functions.invoke('onesignal-send-email', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: payload,
    });

    if (error) {
      const fnError = data as { error?: string } | null;
      throw new Error(fnError?.error || error.message || 'Error al enviar correo');
    }

    const result = data as SendOneSignalTestEmailResult & { error?: string };
    if (result?.error) {
      throw new Error(String(result.error));
    }

    return result;
  }
}
