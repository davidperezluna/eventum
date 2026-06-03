/* ============================================
   ENVIRONMENT - Desarrollo en celular (misma Wi‑Fi)
   Supabase local en la PC; el front se abre desde el móvil.
   ============================================ */

/**
 * IPv4 de tu PC en la red local (`ipconfig` → adaptador Wi‑Fi).
 * Cámbiala si tu IP no es 192.168.1.7.
 */
export const LAN_HOST = '192.168.1.7';

export const environment = {
  production: false,
  /** Identificador del perfil (consola / depuración). */
  profile: 'mobile' as const,
  /** Pruebas en celular (LAN): clientes pueden usar `/login-admin`. */
  allowClienteLoginAdmin: true,
  oneSignal: {
    appId: 'cb3f9dcf-6085-43d5-99ae-6c76db8abf57',
    serviceWorkerPath: '/push/onesignal/OneSignalSDKWorker.js',
    serviceWorkerScope: '/push/onesignal/',
  },
  maintenanceMode: false,
  checkoutUnificadoEnabled: true,
  maintenanceMessage: 'Estamos en mantenimiento. Volvemos pronto.',
  googleTagId: 'GT-5TJZWP3P',
  /** Supabase local vía IP LAN (no usar 127.0.0.1 en el celular). */
  supabaseEnv: 'local' as 'prod' | 'local',
  supabase: {
    url: 'https://jiknhvnaavhfguqfqbod.supabase.co',
    anonKey:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imppa25odm5hYXZoZmd1cWZxYm9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NDUyMDgsImV4cCI6MjA4MDUyMTIwOH0.Kv3i3ospuT_D1NW3nPCIPsBMo04814hmKNLrYdGY6PA',
  },
  supabaseLocal: {
    url: `http://${LAN_HOST}:54321`,
    anonKey: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
  },
  pushNotificationAssets: {
    chromeWebIcon: '/icons/push/chrome-notification-256.png',
    chromeWebBadge: '/icons/push/badge-monochrome-96.png',
  },
};
