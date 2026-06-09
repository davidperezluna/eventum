import { Injectable } from '@angular/core';
import Swal from 'sweetalert2';
import type { SweetAlertOptions, SweetAlertResult } from 'sweetalert2';

/**
 * Servicio centralizado para manejar alertas usando SweetAlert2
 * Reemplaza los alert() y confirm() nativos del navegador
 */
type AppAlertVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'confirm';

type AppModalBaseOptions = Pick<
  SweetAlertOptions,
  'customClass' | 'buttonsStyling' | 'allowOutsideClick' | 'allowEscapeKey'
>;

@Injectable({
  providedIn: 'root'
})
export class AlertService {
  private modalClass(variant: AppAlertVariant = 'default'): SweetAlertOptions['customClass'] {
    return {
      popup: `app-alert-modal app-alert-modal--${variant}`,
      title: 'app-alert-modal__title',
      htmlContainer: 'app-alert-modal__text',
      confirmButton: 'app-alert-modal__btn app-alert-modal__btn--primary',
      cancelButton: 'app-alert-modal__btn app-alert-modal__btn--secondary',
      actions: 'app-alert-modal__actions',
      icon: 'app-alert-modal__icon',
    };
  }

  private baseModalOptions(variant: AppAlertVariant): AppModalBaseOptions {
    return {
      customClass: this.modalClass(variant),
      buttonsStyling: false,
      allowOutsideClick: false,
      allowEscapeKey: false,
    };
  }

  private fireModal(options: SweetAlertOptions): Promise<SweetAlertResult> {
    return Swal.fire(options);
  }

  /**
   * Muestra un snackbar/toast no bloqueante
   */
  snackbar(message: string, options?: { timerMs?: number }): Promise<SweetAlertResult> {
    const timerMs = Math.max(2500, Number(options?.timerMs || 4500));
    return Swal.fire({
      toast: true,
      title: message,
      position: 'bottom-start',
      showConfirmButton: false,
      timer: timerMs,
      timerProgressBar: false,
      allowOutsideClick: true,
      allowEscapeKey: true,
      customClass: {
        popup: 'app-snackbar-toast'
      },
      showClass: {
        popup: 'app-snackbar-enter'
      },
      hideClass: {
        popup: 'app-snackbar-exit'
      }
    });
  }

  /**
   * Muestra un mensaje de éxito
   */
  success(title: string, message?: string): Promise<SweetAlertResult> {
    return this.fireModal({
      ...this.baseModalOptions('success'),
      icon: 'success',
      title,
      text: message,
      confirmButtonText: '¡Perfecto!',
      timer: 3000,
      timerProgressBar: true,
    });
  }

  /**
   * Muestra un mensaje de error.
   * Usa `options.html` para contenido con enlaces (no combinar con `message` como texto plano).
   */
  error(
    title: string,
    message?: string,
    options?: { html?: string }
  ): Promise<SweetAlertResult> {
    const html = options?.html?.trim();
    return this.fireModal({
      ...this.baseModalOptions('error'),
      icon: 'error',
      title,
      ...(html ? { html } : { text: message }),
      confirmButtonText: 'Entendido',
    });
  }

  /**
   * Muestra un mensaje de advertencia
   */
  warning(title: string, message?: string): Promise<SweetAlertResult> {
    return this.fireModal({
      ...this.baseModalOptions('warning'),
      icon: 'warning',
      title,
      text: message,
      confirmButtonText: 'Entendido',
    });
  }

  /**
   * Muestra un mensaje informativo
   */
  info(title: string, message?: string): Promise<SweetAlertResult> {
    return this.fireModal({
      ...this.baseModalOptions('info'),
      icon: 'info',
      title,
      text: message,
      confirmButtonText: 'Entendido',
    });
  }

  /**
   * Muestra un mensaje simple (reemplaza alert())
   */
  alert(title: string, message?: string): Promise<SweetAlertResult> {
    return this.fireModal({
      ...this.baseModalOptions('default'),
      title,
      text: message,
      confirmButtonText: 'OK',
    });
  }

  /**
   * Muestra un diálogo de confirmación (reemplaza confirm())
   */
  confirm(
    title: string,
    message?: string,
    confirmText: string = 'Sí, continuar',
    cancelText: string = 'Cancelar'
  ): Promise<boolean> {
    return this.fireModal({
      ...this.baseModalOptions('confirm'),
      title,
      text: message,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: confirmText,
      cancelButtonText: cancelText,
      reverseButtons: true,
    }).then((result) => {
      return result.isConfirmed;
    });
  }

  /**
   * Muestra un mensaje de confirmación con opciones personalizadas
   */
  confirmCustom(options: SweetAlertOptions): Promise<boolean> {
    return this.fireModal({
      ...this.baseModalOptions('confirm'),
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, continuar',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
      ...options,
    }).then((result) => {
      return result.isConfirmed;
    });
  }

  /**
   * Muestra un mensaje de carga
   */
  loading(title: string = 'Cargando...'): void {
    void this.fireModal({
      ...this.baseModalOptions('default'),
      title,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });
  }

  /**
   * Cierra cualquier alerta abierta
   */
  close(): void {
    Swal.close();
  }

  snackbarSuccess(title: string, message?: string): Promise<SweetAlertResult> {
    return this.snackbar(message ? `${title}. ${message}` : title);
  }

  snackbarError(title: string, message?: string): Promise<SweetAlertResult> {
    return this.snackbar(message ? `${title}. ${message}` : title);
  }
}

