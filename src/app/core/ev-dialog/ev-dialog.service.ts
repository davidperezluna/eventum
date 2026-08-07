import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { resolveEvDialogConfig, presetConfig } from './ev-dialog.presets';
import {
  EvDialogOpenConfig,
  EvDialogPreset,
  EvDialogResult,
  EvDialogState,
  EvToastOptions,
  EvToastState,
} from './ev-dialog.types';

const CLOSED: EvDialogState = { open: false };
const TOAST_HIDDEN: EvToastState = { visible: false };

@Injectable({
  providedIn: 'root',
})
export class EvDialogService {
  private readonly dialogSubject = new BehaviorSubject<EvDialogState>(CLOSED);
  private readonly toastSubject = new BehaviorSubject<EvToastState>(TOAST_HIDDEN);

  private dialogResolve: ((result: EvDialogResult) => void) | null = null;
  private dialogGeneration = 0;
  private autoCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private toastGeneration = 0;

  readonly dialog$ = this.dialogSubject.asObservable();
  readonly toast$ = this.toastSubject.asObservable();

  open(config: EvDialogOpenConfig): Promise<EvDialogResult> {
    this.closeDialog(false);

    const resolved = resolveEvDialogConfig(config);
    const id = ++this.dialogGeneration;

    return new Promise<EvDialogResult>((resolve) => {
      this.dialogResolve = resolve;
      this.dialogSubject.next({ open: true, id, ...resolved });
      this.setDialogScrollLock(true);

      if (resolved.autoCloseMs > 0) {
        this.autoCloseTimer = setTimeout(() => {
          this.finishDialog({ confirmed: true, dismissed: false });
        }, resolved.autoCloseMs);
      }
    });
  }

  confirm(config: EvDialogOpenConfig): Promise<boolean> {
    return this.open({
      showCancel: true,
      tone: config.destructive ? 'destructive' : (config.tone ?? 'confirm'),
      allowOutsideClick: config.allowOutsideClick ?? !config.destructive,
      ...config,
    }).then((result) => result.confirmed);
  }

  preset(preset: EvDialogPreset, overrides: Partial<Omit<EvDialogOpenConfig, 'preset'>> = {}): Promise<EvDialogResult> {
    return this.open(presetConfig(preset, overrides));
  }

  presetConfirm(preset: EvDialogPreset, overrides: Partial<Omit<EvDialogOpenConfig, 'preset'>> = {}): Promise<boolean> {
    return this.confirm(presetConfig(preset, overrides));
  }

  respond(confirmed: boolean): void {
    this.finishDialog({ confirmed, dismissed: !confirmed });
  }

  dismiss(): void {
    this.finishDialog({ confirmed: false, dismissed: true });
  }

  setLoading(loading: boolean, loadingLabel?: string): void {
    const current = this.dialogSubject.value;
    if (!current.open) {
      return;
    }
    this.dialogSubject.next({
      ...current,
      loading,
      loadingLabel: loadingLabel ?? current.loadingLabel,
    });
  }

  closeDialog(silent = true): void {
    if (this.autoCloseTimer) {
      clearTimeout(this.autoCloseTimer);
      this.autoCloseTimer = null;
    }
    if (this.dialogResolve && !silent) {
      this.finishDialog({ confirmed: false, dismissed: true });
      return;
    }
    this.dialogSubject.next(CLOSED);
    this.dialogResolve = null;
    this.setDialogScrollLock(false);
  }

  toast(message: string, options?: EvToastOptions): Promise<void> {
    const tone = options?.tone ?? 'neutral';
    const timerMs = Math.max(2500, options?.timerMs ?? 4200);
    const id = ++this.toastGeneration;

    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }

    return new Promise<void>((resolve) => {
      this.toastSubject.next({
        visible: true,
        id,
        message,
        tone,
        timerMs,
      });

      this.toastTimer = setTimeout(() => {
        this.toastSubject.next(TOAST_HIDDEN);
        this.toastTimer = null;
        resolve();
      }, timerMs);
    });
  }

  hideToast(): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    this.toastSubject.next(TOAST_HIDDEN);
  }

  private finishDialog(result: EvDialogResult): void {
    if (this.autoCloseTimer) {
      clearTimeout(this.autoCloseTimer);
      this.autoCloseTimer = null;
    }
    this.dialogSubject.next(CLOSED);
    this.setDialogScrollLock(false);
    const resolve = this.dialogResolve;
    this.dialogResolve = null;
    resolve?.(result);
  }

  private setDialogScrollLock(locked: boolean): void {
    if (typeof document === 'undefined') {
      return;
    }
    document.documentElement.classList.toggle('ev-dialog-open', locked);
  }
}
