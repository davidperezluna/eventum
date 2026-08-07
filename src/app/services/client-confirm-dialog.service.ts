import { Injectable } from '@angular/core';
import { EvDialogService } from '../core/ev-dialog/ev-dialog.service';
import { EvDialogOpenConfig, EvDialogPreset } from '../core/ev-dialog/ev-dialog.types';
import { presetConfig } from '../core/ev-dialog/ev-dialog.presets';

export interface ClientConfirmRequest {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  icon?: string;
  detail?: string;
  destructive?: boolean;
  preset?: EvDialogPreset;
}

/**
 * Wrapper de compatibilidad para flujos cliente.
 * Delega en el sistema unificado `EvDialogService`.
 */
@Injectable({
  providedIn: 'root',
})
export class ClientConfirmDialogService {
  constructor(private readonly dialog: EvDialogService) {}

  confirm(request: ClientConfirmRequest): Promise<boolean> {
    const config: EvDialogOpenConfig = request.preset
      ? presetConfig(request.preset, {
          title: request.title,
          message: request.message,
          detail: request.detail,
          confirmText: request.confirmText,
          cancelText: request.cancelText,
          icon: request.icon,
          destructive: request.destructive,
        })
      : {
          title: request.title,
          message: request.message,
          detail: request.detail,
          confirmText: request.confirmText,
          cancelText: request.cancelText,
          icon: request.icon,
          destructive: request.destructive,
          tone: request.destructive ? 'destructive' : 'confirm',
          showCancel: true,
        };

    return this.dialog.confirm(config);
  }
}
