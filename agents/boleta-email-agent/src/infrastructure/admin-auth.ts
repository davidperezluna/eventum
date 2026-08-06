import type { SupabasePort } from './supabase.js';
import { withTimeout } from './supabase.js';
import type { AgentConfig } from './config.js';
import { UnauthorizedRequesterError } from '../domain/errors.js';

const ADMIN_TIPO_USUARIO_ID = 3;

/** @see supabase/functions/wompi-reconcile-lookup/index.ts assertAdminCaller */
export async function assertAdminBearer(
  supabase: SupabasePort,
  config: AgentConfig,
  authorizationHeader: string | undefined,
): Promise<{ userId: number; authUserId: string }> {
  const authHeader = authorizationHeader?.trim();
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedRequesterError('Token de autorización requerido');
  }

  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) {
    throw new UnauthorizedRequesterError('Token de autorización inválido');
  }

  const {
    data: { user: callerAuthUser },
    error: callerAuthError,
  } = await withTimeout(
    supabase.auth.getUser(jwt),
    config.supabaseTimeoutMs,
    'adminAuth',
  );

  if (callerAuthError || !callerAuthUser) {
    throw new UnauthorizedRequesterError('Sesión inválida o expirada');
  }

  const { data: caller, error: callerError } = await withTimeout(
    supabase
      .from('usuarios')
      .select('id, tipo_usuario_id, activo')
      .eq('auth_user_id', callerAuthUser.id)
      .maybeSingle(),
    config.supabaseTimeoutMs,
    'adminCallerLookup',
  );

  if (callerError) {
    throw new UnauthorizedRequesterError('No se pudo verificar el usuario');
  }

  if (!caller || caller.tipo_usuario_id !== ADMIN_TIPO_USUARIO_ID || caller.activo !== true) {
    throw new UnauthorizedRequesterError('Acceso restringido a administradores');
  }

  return { userId: Number(caller.id), authUserId: callerAuthUser.id };
}

export function isTelegramUserAllowed(config: AgentConfig, userId: number): boolean {
  if (!config.telegramAllowedUserIds.length) return false;
  return config.telegramAllowedUserIds.includes(userId);
}

export function validateTelegramWebhookSecret(
  config: AgentConfig,
  providedSecret: string | undefined,
): boolean {
  if (!config.telegramWebhookSecret) return false;
  return providedSecret === config.telegramWebhookSecret;
}
