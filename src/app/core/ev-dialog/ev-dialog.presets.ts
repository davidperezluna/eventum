import { EvDialogOpenConfig, EvDialogPreset, EvDialogResolvedConfig, EvDialogTone } from './ev-dialog.types';

interface EvDialogPresetDefinition {
  tone: EvDialogTone;
  icon: string;
  confirmText: string;
  cancelText: string;
  showCancel: boolean;
  destructive?: boolean;
  allowOutsideClick?: boolean;
  title?: string;
  message?: string;
  detail?: string;
  autoCloseMs?: number;
}

const PRESETS: Record<EvDialogPreset, EvDialogPresetDefinition> = {
  'confirm-publish': {
    tone: 'confirm',
    icon: 'rocket_launch',
    confirmText: 'Publicar evento',
    cancelText: 'Aún no',
    showCancel: true,
    title: '¿Publicar este evento?',
    message: 'Tu evento quedará visible para los compradores.',
    detail: 'Podrás despublicarlo más adelante si lo necesitas.',
    allowOutsideClick: true,
  },
  'delete-event': {
    tone: 'destructive',
    icon: 'delete_forever',
    confirmText: 'Eliminar evento',
    cancelText: 'Conservar',
    showCancel: true,
    destructive: true,
    title: '¿Eliminar este evento?',
    message: 'Se borrarán los datos asociados a esta experiencia.',
    detail: 'No podrás deshacer esta acción.',
    allowOutsideClick: false,
  },
  'discard-changes': {
    tone: 'warning',
    icon: 'edit_off',
    confirmText: 'Salir sin guardar',
    cancelText: 'Seguir editando',
    showCancel: true,
    title: 'Cambios sin guardar',
    message: 'Tienes cambios que aún no se han guardado.',
    detail: 'Si sales ahora, perderás lo que editaste en esta pantalla.',
    allowOutsideClick: false,
  },
  saved: {
    tone: 'success',
    icon: 'check_circle',
    confirmText: 'Entendido',
    cancelText: 'Cerrar',
    showCancel: false,
    title: 'Guardado',
    message: 'Los cambios se guardaron correctamente.',
    detail: 'Esta información podrá modificarse más adelante.',
    autoCloseMs: 2800,
  },
  'connection-error': {
    tone: 'error',
    icon: 'wifi_off',
    confirmText: 'Reintentar',
    cancelText: 'Cerrar',
    showCancel: false,
    title: 'Sin conexión',
    message: 'No pudimos comunicarnos con el servidor.',
    detail: 'Revisa tu internet e inténtalo de nuevo.',
  },
  'server-error': {
    tone: 'error',
    icon: 'cloud_off',
    confirmText: 'Entendido',
    cancelText: 'Cerrar',
    showCancel: false,
    title: 'Algo salió mal',
    message: 'Ocurrió un error inesperado en el servidor.',
    detail: 'Si el problema continúa, intenta de nuevo en unos minutos.',
  },
  warning: {
    tone: 'warning',
    icon: 'report_gmailerrorred',
    confirmText: 'Entendido',
    cancelText: 'Cerrar',
    showCancel: false,
  },
  info: {
    tone: 'info',
    icon: 'info',
    confirmText: 'Entendido',
    cancelText: 'Cerrar',
    showCancel: false,
  },
  logout: {
    tone: 'neutral',
    icon: 'logout',
    confirmText: 'Cerrar sesión',
    cancelText: 'Cancelar',
    showCancel: true,
    title: '¿Cerrar sesión?',
    message: 'Tendrás que volver a iniciar sesión para continuar.',
    detail: 'Tus datos guardados permanecerán seguros.',
    allowOutsideClick: true,
  },
  'delete-product': {
    tone: 'destructive',
    icon: 'inventory_2',
    confirmText: 'Eliminar producto',
    cancelText: 'Conservar',
    showCancel: true,
    destructive: true,
    title: '¿Eliminar este producto?',
    message: 'Dejará de aparecer en la venta del evento.',
    detail: 'No podrás deshacer esta acción.',
    allowOutsideClick: false,
  },
  'delete-palco': {
    tone: 'destructive',
    icon: 'weekend',
    confirmText: 'Eliminar palco',
    cancelText: 'Conservar',
    showCancel: true,
    destructive: true,
    title: '¿Eliminar este palco?',
    message: 'Se quitará del mapa y del catálogo de venta.',
    detail: 'No podrás deshacer esta acción.',
    allowOutsideClick: false,
  },
  'delete-coupon': {
    tone: 'destructive',
    icon: 'sell',
    confirmText: 'Eliminar cupón',
    cancelText: 'Conservar',
    showCancel: true,
    destructive: true,
    title: '¿Eliminar este cupón?',
    message: 'Los compradores ya no podrán usar este código.',
    detail: 'No podrás deshacer esta acción.',
    allowOutsideClick: false,
  },
  'delete-ticket': {
    tone: 'destructive',
    icon: 'confirmation_number',
    confirmText: 'Eliminar tipo de boleta',
    cancelText: 'Conservar',
    showCancel: true,
    destructive: true,
    title: '¿Eliminar este tipo de boleta?',
    message: 'Dejará de estar disponible para nuevas ventas.',
    detail: 'No podrás deshacer esta acción.',
    allowOutsideClick: false,
  },
};

const TONE_ICONS: Record<EvDialogTone, string> = {
  neutral: 'chat_bubble_outline',
  confirm: 'help_outline',
  warning: 'report_gmailerrorred',
  info: 'info',
  success: 'check_circle',
  error: 'error_outline',
  destructive: 'delete_outline',
};

const TONE_CONFIRM: Record<EvDialogTone, string> = {
  neutral: 'Entendido',
  confirm: 'Continuar',
  warning: 'Entendido',
  info: 'Entendido',
  success: 'Perfecto',
  error: 'Entendido',
  destructive: 'Eliminar',
};

export function resolveEvDialogConfig(config: EvDialogOpenConfig): EvDialogResolvedConfig {
  const preset = config.preset ? PRESETS[config.preset] : undefined;
  const tone = config.destructive ? 'destructive' : (config.tone ?? preset?.tone ?? 'neutral');
  const destructive = config.destructive ?? preset?.destructive ?? tone === 'destructive';

  return {
    title: config.title || preset?.title || '',
    message: config.message ?? preset?.message ?? '',
    detail: config.detail ?? preset?.detail ?? '',
    tone,
    icon: config.icon ?? preset?.icon ?? TONE_ICONS[tone],
    html: config.html ?? '',
    confirmText: config.confirmText ?? preset?.confirmText ?? TONE_CONFIRM[tone],
    cancelText: config.cancelText ?? preset?.cancelText ?? 'Cancelar',
    showCancel: config.showCancel ?? preset?.showCancel ?? false,
    destructive,
    allowOutsideClick: config.allowOutsideClick ?? preset?.allowOutsideClick ?? !destructive,
    allowEscapeKey: config.allowEscapeKey ?? true,
    autoCloseMs: config.autoCloseMs ?? preset?.autoCloseMs ?? 0,
    loading: config.loading ?? false,
    loadingLabel: config.loadingLabel ?? 'Procesando…',
  };
}

export function presetConfig(
  preset: EvDialogPreset,
  overrides: Partial<Omit<EvDialogOpenConfig, 'preset'>> = {},
): EvDialogOpenConfig {
  return { preset, ...overrides };
}

export { PRESETS as EV_DIALOG_PRESETS };
