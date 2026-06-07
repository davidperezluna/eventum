import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ClientConfirmRequest {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  icon?: string;
}

export type ClientConfirmDialogState =
  | { open: false }
  | ({ open: true } & Required<Pick<ClientConfirmRequest, 'title' | 'message'>> &
      Omit<ClientConfirmRequest, 'title' | 'message'>);

const CLOSED: ClientConfirmDialogState = { open: false };

@Injectable({
  providedIn: 'root',
})
export class ClientConfirmDialogService {
  private readonly stateSubject = new BehaviorSubject<ClientConfirmDialogState>(CLOSED);
  private resolveFn: ((confirmed: boolean) => void) | null = null;

  readonly state$ = this.stateSubject.asObservable();

  confirm(request: ClientConfirmRequest): Promise<boolean> {
    if (this.resolveFn) {
      this.finish(false);
    }

    return new Promise<boolean>((resolve) => {
      this.resolveFn = resolve;
      this.stateSubject.next({
        open: true,
        title: request.title,
        message: request.message,
        confirmText: request.confirmText ?? 'Sí, continuar',
        cancelText: request.cancelText ?? 'Cancelar',
        icon: request.icon ?? 'swap_horiz',
      });
    });
  }

  respond(confirmed: boolean): void {
    this.finish(confirmed);
  }

  private finish(confirmed: boolean): void {
    this.stateSubject.next(CLOSED);
    const resolve = this.resolveFn;
    this.resolveFn = null;
    resolve?.(confirmed);
  }
}
