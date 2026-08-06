import { Type } from '@angular/core';

export type EvDrawerSize = 'sm' | 'md' | 'lg' | 'xl' | 'fullscreen';

export interface EvDrawerConfig<TData = unknown> {
  title: string;
  description?: string;
  /** Icono Material Symbols del header */
  icon?: string;
  size?: EvDrawerSize;
  data?: TData;
  /** Muestra skeleton en lugar del contenido */
  loading?: boolean;
  /** Permite cerrar al hacer clic en el overlay. Default: true */
  closeOnBackdrop?: boolean;
  /** Permite cerrar con Escape. Default: true */
  closeOnEscape?: boolean;
  /** Muestra botón de cerrar en el header. Default: true */
  showCloseButton?: boolean;
}

export interface EvDrawerOpenConfig<TComponent = unknown, TData = unknown>
  extends EvDrawerConfig<TData> {
  component: Type<TComponent>;
  /** Inputs adicionales asignados a la instancia del componente dinámico */
  inputs?: Partial<TComponent>;
}

export interface EvDrawerShellPatch {
  title?: string;
  description?: string;
  icon?: string;
  size?: EvDrawerSize;
  loading?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
}

export interface EvDrawerDiscardPrompt {
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
}

export type EvDrawerCloseReason = 'close-button' | 'backdrop' | 'escape' | 'programmatic';

export interface EvDrawerState {
  open: boolean;
  title: string;
  description?: string;
  icon?: string;
  size: EvDrawerSize;
  loading: boolean;
  closeOnBackdrop: boolean;
  closeOnEscape: boolean;
  showCloseButton: boolean;
  closing: boolean;
}

export const EV_DRAWER_DEFAULT_STATE: EvDrawerState = {
  open: false,
  title: '',
  size: 'md',
  loading: false,
  closeOnBackdrop: true,
  closeOnEscape: true,
  showCloseButton: true,
  closing: false,
};
