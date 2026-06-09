import { ChangeDetectorRef, Component, HostListener, NgZone, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { CoversService } from '../../services/covers.service';
import { ClubesExplorarState, ClubesStateService } from '../../services/clubes-state.service';
import { LugarCoverListado } from '../../types/covers';
import { COVERS_LABELS, formatHoraCover } from '../../core/covers-labels';

@Component({
  selector: 'app-clubes-explorar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './clubes-explorar.html',
  styleUrls: ['../cupos-evento/cupos-evento.css', './clubes-explorar.css'],
})
export class ClubesExplorar implements OnInit, OnDestroy {
  readonly coversLabels = COVERS_LABELS;

  loading = false;
  isRefreshing = false;
  lugares: LugarCoverListado[] = [];

  private refreshIndicatorTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshStartedAt: number | null = null;
  private readonly refreshIndicatorDelayMs = 800;
  private hadCachedDataOnInit = false;

  constructor(
    private coversService: CoversService,
    private clubesStateService: ClubesStateService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
  ) {
    const cachedState = this.clubesStateService.getExplorarState();
    if (cachedState?.lugares?.length) {
      this.applyCachedState(cachedState);
      this.hadCachedDataOnInit = true;
    }
  }

  ngOnInit(): void {
    const cachedState = this.clubesStateService.getExplorarState();
    if (cachedState?.lugares?.length) {
      this.applyCachedState(cachedState);
      this.loading = false;
      this.hadCachedDataOnInit = true;
      setTimeout(() => window.scrollTo({ top: cachedState.scrollY, behavior: 'auto' }), 0);
    } else {
      this.loading = true;
    }

    void this.cargar({ background: this.hadCachedDataOnInit });
  }

  ngOnDestroy(): void {
    this.persistState(Date.now());
    this.stopSilentRefreshIndicator();
  }

  @HostListener('window:beforeunload')
  @HostListener('window:pagehide')
  onPageExit(): void {
    this.persistState(Date.now());
  }

  private refreshView(): void {
    this.ngZone.run(() => this.cdr.detectChanges());
  }

  async cargar(options?: { background?: boolean }): Promise<void> {
    const background = options?.background ?? false;
    const hasVisibleData = this.lugares.length > 0;
    const silentRefreshMode = background || hasVisibleData;
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;

    if (offline && hasVisibleData) {
      console.info('[ClubesExplorar] Sin conexión, usando datos cacheados');
      this.loading = false;
      this.stopSilentRefreshIndicator();
      this.refreshView();
      return;
    }

    this.loading = !silentRefreshMode && !hasVisibleData;
    if (silentRefreshMode) {
      this.startSilentRefreshIndicator();
    } else {
      this.stopSilentRefreshIndicator();
    }
    this.refreshView();

    const refreshStartedAt = Date.now();
    const previousLugares = [...this.lugares];

    try {
      this.lugares = await this.coversService.listarLugaresConCovers();
      this.persistState(Date.now());
    } catch {
      if (silentRefreshMode) {
        this.lugares = previousLugares;
      } else {
        this.lugares = [];
      }
    } finally {
      this.loading = false;
      this.stopSilentRefreshIndicator();
      if (silentRefreshMode) {
        console.info('[ClubesExplorar] Refresco silencioso finalizado', {
          durationMs: Date.now() - refreshStartedAt,
          lugares: this.lugares.length,
        });
      }
      this.refreshView();
    }
  }

  private applyCachedState(state: ClubesExplorarState): void {
    this.lugares = [...state.lugares];
  }

  private persistState(lastUpdated: number): void {
    if (this.lugares.length === 0) {
      return;
    }
    this.clubesStateService.saveExplorarState({
      lugares: this.lugares,
      scrollY: typeof window !== 'undefined' ? window.scrollY : 0,
      lastUpdated,
    });
  }

  private startSilentRefreshIndicator(): void {
    this.refreshStartedAt = Date.now();
    console.info('[ClubesExplorar] Refresco silencioso iniciado');

    if (this.refreshIndicatorTimer) {
      clearTimeout(this.refreshIndicatorTimer);
    }
    this.isRefreshing = false;
    this.refreshIndicatorTimer = setTimeout(() => {
      this.isRefreshing = true;
      this.refreshView();
    }, this.refreshIndicatorDelayMs);
  }

  private stopSilentRefreshIndicator(): void {
    if (this.refreshIndicatorTimer) {
      clearTimeout(this.refreshIndicatorTimer);
      this.refreshIndicatorTimer = null;
    }

    if (this.refreshStartedAt) {
      this.refreshStartedAt = null;
    }

    this.isRefreshing = false;
  }

  formatCurrency(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(Number(value))) return '';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Number(value));
  }

  formatHora(hora: string | null | undefined): string {
    return formatHoraCover(hora);
  }

  trackLugar(_index: number, lugar: LugarCoverListado): number {
    return lugar.id;
  }
}
