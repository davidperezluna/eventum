import { Injectable } from '@angular/core';
import { EvDialogService } from '../core/ev-dialog/ev-dialog.service';
import { EvDialogOpenConfig, EvDialogResult } from '../core/ev-dialog/ev-dialog.types';

/** Resultado compatible con integraciones legacy (sin SweetAlert). */
export interface AppAlertResult {
  isConfirmed: boolean;
  isDismissed: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class AlertService {
  constructor(private readonly dialog: EvDialogService) {}

  snackbar(message: string, options?: { timerMs?: number }): Promise<AppAlertResult> {
    return this.dialog.toast(message, { timerMs: options?.timerMs }).then(() => ({
      isConfirmed: true,
      isDismissed: false,
    }));
  }

  success(title: string, message?: string): Promise<AppAlertResult> {
    return this.openAlert({
      tone: 'success',
      title,
      message,
      confirmText: 'Perfecto',
      autoCloseMs: 2800,
    });
  }

  error(title: string, message?: string, options?: { html?: string }): Promise<AppAlertResult> {
    return this.openAlert({
      tone: 'error',
      title,
      message: options?.html ? undefined : message,
      html: options?.html,
      confirmText: 'Entendido',
    });
  }

  warning(title: string, message?: string): Promise<AppAlertResult> {
    return this.openAlert({
      tone: 'warning',
      title,
      message,
      confirmText: 'Entendido',
    });
  }

  info(title: string, message?: string): Promise<AppAlertResult> {
    return this.openAlert({
      tone: 'info',
      title,
      message,
      confirmText: 'Entendido',
    });
  }

  alert(title: string, message?: string): Promise<AppAlertResult> {
    return this.openAlert({
      tone: 'neutral',
      title,
      message,
      confirmText: 'OK',
    });
  }

  confirm(
    title: string,
    message?: string,
    confirmText: string = 'Sí, continuar',
    cancelText: string = 'Cancelar',
  ): Promise<boolean> {
    return this.dialog.confirm({
      title,
      message,
      confirmText,
      cancelText,
      tone: 'confirm',
    });
  }

  confirmCustom(options: EvDialogOpenConfig): Promise<boolean> {
    return this.dialog.confirm({
      showCancel: true,
      tone: 'confirm',
      ...options,
    });
  }

  /** Confirmación destructiva con jerarquía visual dedicada. */
  confirmDestructive(
    title: string,
    message?: string,
    confirmText: string = 'Eliminar',
    cancelText: string = 'Conservar',
  ): Promise<boolean> {
    return this.dialog.confirm({
      title,
      message,
      confirmText,
      cancelText,
      destructive: true,
      detail: 'No podrás deshacer esta acción.',
    });
  }

  presetConfirm(
    preset: import('../core/ev-dialog/ev-dialog.types').EvDialogPreset,
    overrides: Partial<Omit<EvDialogOpenConfig, 'preset'>> = {},
  ): Promise<boolean> {
    return this.dialog.presetConfirm(preset, overrides);
  }

  loading(title: string = 'Cargando…'): void {
    void this.dialog.open({
      title,
      tone: 'neutral',
      icon: 'hourglass_top',
      loading: true,
      loadingLabel: title,
      showCancel: false,
      confirmText: title,
      allowOutsideClick: false,
      allowEscapeKey: false,
    });
  }

  close(): void {
    this.dialog.closeDialog(true);
  }

  snackbarSuccess(title: string, message?: string): Promise<AppAlertResult> {
    return this.snackbar(message ? `${title}. ${message}` : title);
  }

  snackbarError(title: string, message?: string): Promise<AppAlertResult> {
    return this.snackbar(message ? `${title}. ${message}` : title, { timerMs: 5200 });
  }

  private openAlert(config: EvDialogOpenConfig): Promise<AppAlertResult> {
    return this.dialog
      .open({
        showCancel: false,
        allowOutsideClick: true,
        ...config,
      })
      .then((result) => this.toLegacyResult(result));
  }

  private toLegacyResult(result: EvDialogResult): AppAlertResult {
    return {
      isConfirmed: result.confirmed,
      isDismissed: result.dismissed,
    };
  }
}
