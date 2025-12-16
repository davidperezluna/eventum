import { Injectable } from '@angular/core';
import Swal from 'sweetalert2';
import type { SweetAlertOptions, SweetAlertResult } from 'sweetalert2';

/**
 * Servicio centralizado para manejar alertas usando SweetAlert2
 * Reemplaza los alert() y confirm() nativos del navegador
 */
@Injectable({
  providedIn: 'root'
})
export class AlertService {
  /**
   * Muestra un mensaje de éxito
   */
  success(title: string, message?: string): Promise<SweetAlertResult> {
    return Swal.fire({
      icon: 'success',
      title,
      text: message,
      confirmButtonText: '¡Perfecto!',
      confirmButtonColor: '#10b981',
      timer: 3000,
      timerProgressBar: true
    });
  }

  /**
   * Muestra un mensaje de error
   */
  error(title: string, message?: string): Promise<SweetAlertResult> {
    return Swal.fire({
      icon: 'error',
      title,
      text: message,
      confirmButtonText: 'Entendido',
      confirmButtonColor: '#ef4444'
    });
  }

  /**
   * Muestra un mensaje de advertencia
   */
  warning(title: string, message?: string): Promise<SweetAlertResult> {
    return Swal.fire({
      icon: 'warning',
      title,
      text: message,
      confirmButtonText: 'Entendido',
      confirmButtonColor: '#f59e0b'
    });
  }

  /**
   * Muestra un mensaje informativo
   */
  info(title: string, message?: string): Promise<SweetAlertResult> {
    return Swal.fire({
      icon: 'info',
      title,
      text: message,
      confirmButtonText: 'Entendido',
      confirmButtonColor: '#3b82f6'
    });
  }

  /**
   * Muestra un mensaje simple (reemplaza alert())
   */
  alert(title: string, message?: string): Promise<SweetAlertResult> {
    return Swal.fire({
      title,
      text: message,
      confirmButtonText: 'OK',
      confirmButtonColor: '#667eea'
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
    return Swal.fire({
      title,
      text: message,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: confirmText,
      cancelButtonText: cancelText,
      confirmButtonColor: '#667eea',
      cancelButtonColor: '#6b7280',
      reverseButtons: true
    }).then((result) => {
      return result.isConfirmed;
    });
  }

  /**
   * Muestra un mensaje de confirmación con opciones personalizadas
   */
  confirmCustom(options: Partial<SweetAlertOptions>): Promise<boolean> {
    const defaultOptions: Partial<SweetAlertOptions> = {
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, continuar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#667eea',
      cancelButtonColor: '#6b7280',
      reverseButtons: true
    };

    return Swal.fire({ ...defaultOptions, ...options } as SweetAlertOptions).then((result) => {
      return result.isConfirmed;
    });
  }

  /**
   * Muestra un mensaje de carga
   */
  loading(title: string = 'Cargando...'): void {
    Swal.fire({
      title,
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });
  }

  /**
   * Cierra cualquier alerta abierta
   */
  close(): void {
    Swal.close();
  }
}

