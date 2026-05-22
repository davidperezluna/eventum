/* ============================================
   SUPABASE CONFIGURATION
   ============================================ */

import { environment } from '../../environments/environment';

/**
 * Configuración de Supabase desde environment
 * 
 * Las credenciales se configuran en:
 * - src/environments/environment.ts (desarrollo PC)
 * - src/environments/environment.dev.ts (dev desplegado / Vercel staging)
 * - src/environments/environment.mobile.ts (desarrollo celular + Supabase LAN)
 * - src/environments/environment.prod.ts (producción)
 */

type SupabaseEnv = 'prod' | 'local';

const selectedEnv: SupabaseEnv = environment.supabaseEnv === 'local' ? 'local' : 'prod';
const activeConfig = selectedEnv === 'local' ? environment.supabaseLocal : environment.supabase;

export const supabaseConfig = {
  env: selectedEnv,
  url: activeConfig.url,
  anonKey: activeConfig.anonKey,
};

const profile =
  'profile' in environment && environment.profile ? environment.profile : 'unknown';

console.info(
  `[Supabase][Web] Perfil: ${profile} | Supabase: ${supabaseConfig.env}` +
    (supabaseConfig.env === 'local' ? ` → ${supabaseConfig.url}` : '')
);

// Validación de configuración
if (!supabaseConfig.url || !supabaseConfig.anonKey) {
  console.warn(
    '⚠️ Supabase no está configurado. Por favor, configura las credenciales en src/environments/environment.ts'
  );
  console.warn(
    '📝 Obtén tus credenciales en: https://app.supabase.com/project/[tu-proyecto]/settings/api'
  );
}

