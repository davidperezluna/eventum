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

export const supabaseConfig = {
  url: environment.supabase.url,
  anonKey: environment.supabase.anonKey,
};

// Validación de configuración
if (!supabaseConfig.url || !supabaseConfig.anonKey) {
  console.warn(
    '⚠️ Supabase no está configurado. Por favor, configura las credenciales en src/environments/environment.ts'
  );
  console.warn(
    '📝 Obtén tus credenciales en: https://app.supabase.com/project/[tu-proyecto]/settings/api'
  );
}

