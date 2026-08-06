import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { AgentConfig } from './config.js';
import { ExternalServiceError } from '../domain/errors.js';

export type SupabasePort = SupabaseClient;

export function createSupabaseClient(config: AgentConfig): SupabasePort {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new ExternalServiceError(`${label} timeout`, 'supabase')),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
