/* ============================================
   ENVIRONMENT - Dev desplegado (Vercel / staging)
   Copia de environment.ts para preview sin tocar prod local.
   ============================================ */

export const environment = {
  production: false,
  /** Perfil: build dev en Vercel u otro hosting de pruebas */
  profile: 'dev' as const,
  /** Solo dev/pruebas: clientes pueden usar email/contraseña en `/login-admin`. */
  allowClienteLoginAdmin: true,
  /** Mantener alineado con `index.html` (OneSignal se inicializa allí antes del bundle). */
  oneSignal: {
    appId: 'cb3f9dcf-6085-43d5-99ae-6c76db8abf57',
    serviceWorkerPath: '/push/onesignal/OneSignalSDKWorker.js',
    serviceWorkerScope: '/push/onesignal/',
  },
  maintenanceMode: false,
  maintenanceMessage: 'Estamos en mantenimiento. Volvemos pronto.',
  googleTagId: 'GT-5TJZWP3P', // Google Tag ID
  /** `prod` = front usa Supabase alojado. `local` = API en 127.0.0.1:54321 */
  supabaseEnv: 'prod' as 'prod' | 'local',
  supabase: {
    url: 'https://modctxrsohemzlzlvlih.supabase.co',
    anonKey: 'sb_publishable_zScIqYpiyMpCRtV0wzXtmA_U3fwfoxw',
  },
  supabaseLocal: {
    url: 'https://modctxrsohemzlzlvlih.supabase.co',
    anonKey: 'sb_publishable_zScIqYpiyMpCRtV0wzXtmA_U3fwfoxw',
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
};
