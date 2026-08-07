export type EvDialogTone =
  | 'neutral'
  | 'confirm'
  | 'warning'
  | 'info'
  | 'success'
  | 'error'
  | 'destructive';

export type EvDialogPreset =
  | 'confirm-publish'
  | 'delete-event'
  | 'discard-changes'
  | 'saved'
  | 'connection-error'
  | 'server-error'
  | 'warning'
  | 'info'
  | 'logout'
  | 'delete-product'
  | 'delete-palco'
  | 'delete-coupon'
  | 'delete-ticket';

export interface EvDialogOpenConfig {
  title?: string;
  message?: string;
  /** Texto auxiliar en lenguaje humano (consejo, consecuencia). */
  detail?: string;
  tone?: EvDialogTone;
  preset?: EvDialogPreset;
  icon?: string;
  html?: string;
  confirmText?: string;
  cancelText?: string;
  showCancel?: boolean;
  destructive?: boolean;
  allowOutsideClick?: boolean;
  allowEscapeKey?: boolean;
  autoCloseMs?: number;
  loading?: boolean;
  loadingLabel?: string;
}

export interface EvDialogResolvedConfig extends Required<
  Pick<
    EvDialogOpenConfig,
    | 'title'
    | 'confirmText'
    | 'cancelText'
    | 'showCancel'
    | 'destructive'
    | 'allowOutsideClick'
    | 'allowEscapeKey'
    | 'loading'
    | 'loadingLabel'
  >
> {
  message: string;
  detail: string;
  tone: EvDialogTone;
  icon: string;
  html: string;
  autoCloseMs: number;
}

export type EvDialogState =
  | { open: false }
  | ({ open: true; id: number } & EvDialogResolvedConfig);

export interface EvDialogResult {
  confirmed: boolean;
  dismissed: boolean;
}

export interface EvToastOptions {
  tone?: 'neutral' | 'success' | 'error';
  timerMs?: number;
}

export type EvToastState =
  | { visible: false }
  | ({ visible: true; id: number; message: string } & Required<EvToastOptions>);
