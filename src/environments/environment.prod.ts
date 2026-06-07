/* ============================================
   ENVIRONMENT - Producción
   ============================================ */

export const environment = {
  appVersion: '1.0.0',
  production: true,
  profile: 'production' as const,
  /** En producción los clientes solo entran por `/login` (Google). */
  allowClienteLoginAdmin: false,
  /** Cambiar a `true` cuando publiques el módulo Cupos Eventum en producción. */
  cuposEventumEnabled: true,
  /** Cambiar a `true` cuando publiques el módulo Covers Eventum en producción. */
  coversEventumEnabled: false,
  /** Mantener alineado con `index.html` (OneSignal se inicializa allí antes del bundle). */
  oneSignal: {
    appId: 'cb3f9dcf-6085-43d5-99ae-6c76db8abf57',
    serviceWorkerPath: '/push/onesignal/OneSignalSDKWorker.js',
    serviceWorkerScope: '/push/onesignal/',
  },
  maintenanceMode: false,
  maintenanceMessage: 'Estamos en mantenimiento. Volvemos pronto.',
  googleTagId: 'GT-5TJZWP3P', // Google Tag ID
  supabaseEnv: 'prod' as 'prod' | 'local',

  supabase: {
    url: 'https://jiknhvnaavhfguqfqbod.supabase.co',
    anonKey:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imppa25odm5hYXZoZmd1cWZxYm9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NDUyMDgsImV4cCI6MjA4MDUyMTIwOH0.Kv3i3ospuT_D1NW3nPCIPsBMo04814hmKNLrYdGY6PA',
  },

  supabaseLocal: {
    url: 'http://127.0.0.1:54321',
    anonKey: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
  },
  publicAppUrl: 'https://www.eventumcol.com',

  /** Comprobación de nueva versión PWA (ngsw) en apps instaladas iOS/Android. */
  pwa: {
    /** Cada cuánto comprobar si hay build nuevo (ms). Recarga en silencio si lo hay. */
    updateCheckIntervalMs: 5 * 60 * 1000,
  },

  /**
   * Rutas de iconos Web Push (servidos desde `public/` → raíz del sitio).
   * En OneSignal: Settings → Web → Default Notification Icon URL = `{origen}/icons/push/chrome-notification-256.png`
   * Al enviar push: Chrome Web Push → icon + badge con las URLs abajo.
   */
  pushNotificationAssets: {
    chromeWebIcon: '/icons/push/chrome-notification-256.png',
    chromeWebBadge: '/icons/push/badge-monochrome-96.png',
  },
};
