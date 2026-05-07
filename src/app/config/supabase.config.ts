/* ============================================
   SUPABASE CONFIGURATION
   ============================================ */

import { environment } from '../../environments/environment';

/**
 * Configuración de Supabase desde environment
 * 
 * Las credenciales se configuran en:
 * - src/environments/environment.ts (desarrollo)
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

console.info(`[Supabase][Web] Ambiente activo: ${supabaseConfig.env}`);

// Validación de configuración
if (!supabaseConfig.url || !supabaseConfig.anonKey) {
  console.warn(
    '⚠️ Supabase no está configurado. Por favor, configura las credenciales en src/environments/environment.ts'
  );
  console.warn(
    '📝 Obtén tus credenciales en: https://app.supabase.com/project/[tu-proyecto]/settings/api'
  );
}

