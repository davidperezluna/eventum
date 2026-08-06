import { Subject } from 'rxjs';
import { EvDrawerCloseReason, EvDrawerShellPatch, EvDrawerSize } from './drawer.types';

export class DrawerRef<TResult = void> {
  private readonly afterClosedSubject = new Subject<TResult | undefined>();
  private dirty = false;
  private closed = false;
  private pendingResult?: TResult;

  readonly afterClosed$ = this.afterClosedSubject.asObservable();

  constructor(
    private readonly requestCloseFn: (
      reason: EvDrawerCloseReason,
      ref: DrawerRef<unknown>,
    ) => Promise<boolean>,
    private readonly patchShellFn: (patch: EvDrawerShellPatch) => void,
  ) {}

  markDirty(): void {
    this.dirty = true;
  }

  markPristine(): void {
    this.dirty = false;
  }

  get hasPendingChanges(): boolean {
    return this.dirty;
  }

  setTitle(title: string): void {
    this.patchShellFn({ title });
  }

  setDescription(description: string | undefined): void {
    this.patchShellFn({ description });
  }

  setIcon(icon: string | undefined): void {
    this.patchShellFn({ icon });
  }

  setLoading(loading: boolean): void {
    this.patchShellFn({ loading });
  }

  resize(size: EvDrawerSize): void {
    this.patchShellFn({ size });
  }

  /** Solicita cierre; el resultado se emite tras la animación de salida */
  async close(result?: TResult): Promise<boolean> {
    if (this.closed) {
      return false;
    }
    this.pendingResult = result;
    const allowed = await this.requestCloseFn('programmatic', this as DrawerRef<unknown>);
    if (!allowed) {
      this.pendingResult = undefined;
      return false;
    }
    return true;
  }

  /** Cierra de inmediato sin animación ni confirmación */
  forceClose(result?: TResult): void {
    if (this.closed) {
      return;
    }
    this.finish(result);
  }

  afterClosed(): Promise<TResult | undefined> {
    return new Promise((resolve) => {
      const sub = this.afterClosed$.subscribe((value) => {
        sub.unsubscribe();
        resolve(value);
      });
    });
  }

  internalFinish(result?: TResult): void {
    this.finish(result ?? this.pendingResult);
    this.pendingResult = undefined;
  }

  private finish(result?: TResult): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.afterClosedSubject.next(result);
    this.afterClosedSubject.complete();
  }
}
