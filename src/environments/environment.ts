/* ============================================
   ENVIRONMENT - Desarrollo
   ============================================ */

export const environment = {
  /** Versión visible en footer /eventos-cliente (semver). */
  appVersion: '1.0.0',
  production: false,
  /** Perfil: PC en localhost + Supabase local en 127.0.0.1 */
  profile: 'development' as const,
  /** Solo dev/pruebas: clientes pueden usar email/contraseña en `/login-admin`. */
  allowClienteLoginAdmin: true,
  /** `true`: tablón de cupos, /cupos, /mis-cupos y enlaces en la app. `false`: oculta todo el módulo. */
  cuposEventumEnabled: true,
  /** `true`: módulo Covers (clubes por lugar, sesiones, aforo, reingreso). `false`: oculta rutas y UI. */
  coversEventumEnabled: true,
  /**
   * Detalle evento → Entradas (no agotadas): mostrar disponibles / reservados / vendidas / totales.
   * `false` = ocultar esas cifras. Etapas agotadas siempre las muestran.
   */
  mostrarMetricasEntradasDisponibles: false,
  /** Mantener alineado con `index.html` (OneSignal se inicializa allí antes del bundle). */
  oneSignal: {
    appId: 'cb3f9dcf-6085-43d5-99ae-6c76db8abf57',
    serviceWorkerPath: '/push/onesignal/OneSignalSDKWorker.js',
    serviceWorkerScope: '/push/onesignal/',
  },
  maintenanceMode: false,
  maintenanceMessage: 'Estamos en mantenimiento. Volvemos pronto.',
  googleTagId: 'GT-5TJZWP3P', // Google Tag ID
  /** `prod` = front en localhost usa Supabase alojado (PRD). `local` = API en 127.0.0.1:54321 */
  supabaseEnv: 'prod' as 'prod' | 'local',
  // supabase: {
  //   url: 'https://jiknhvnaavhfguqfqbod.supabase.co',
  //   anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imppa25odm5hYXZoZmd1cWZxYm9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NDUyMDgsImV4cCI6MjA4MDUyMTIwOH0.Kv3i3ospuT_D1NW3nPCIPsBMo04814hmKNLrYdGY6PA'
  // },
  supabase: {
    url: 'https://modctxrsohemzlzlvlih.supabase.co',
    anonKey: 'sb_publishable_zScIqYpiyMpCRtV0wzXtmA_U3fwfoxw'
  },
  supabaseLocal: {
    url: 'https://modctxrsohemzlzlvlih.supabase.co',
    anonKey: 'sb_publishable_zScIqYpiyMpCRtV0wzXtmA_U3fwfoxw'
  },

  /**
   * Rutas de iconos Web Push (servidos desde `public/` → raíz del sitio).
   * En OneSignal: Settings → Web → Default Notification Icon URL = `{origen}/icons/push/chrome-notification-256.png`
   * Al enviar push: Chrome Web Push → icon = misma URL; badge = `{origen}/icons/push/badge-monochrome-96.png`
   */
  pushNotificationAssets: {
    chromeWebIcon: '/icons/push/chrome-notification-256.png',
    chromeWebBadge: '/icons/push/badge-monochrome-96.png',
  },

  /** PWA (ngsw); deshabilitado en localhost (`ng serve`). */
  pwa: {
    serviceWorkerEnabled: false,
    updateCheckIntervalMs: 5 * 60 * 1000,
    showUpdateNotification: false,
  },
};

