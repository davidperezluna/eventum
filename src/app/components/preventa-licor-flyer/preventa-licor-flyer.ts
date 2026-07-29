import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import {
  marcarPreventaLicorFlyerVistoEnSesion,
  preventaLicorFlyerVistoEnSesion,
} from '../../core/preventa-licor-flyer-session';
import { PreventaLicorPromoDestacada } from '../../services/productos.service';

const ENTRANCE_DELAY_MS = 700;

@Component({
  selector: 'app-preventa-licor-flyer',
  imports: [CommonModule, RouterModule],
  templateUrl: './preventa-licor-flyer.html',
  styleUrl: './preventa-licor-flyer.css',
})
export class PreventaLicorFlyer implements OnInit, OnChanges, OnDestroy {
  @Input({ required: true }) promo!: PreventaLicorPromoDestacada;
  @Input({ required: true }) eventoTitulo = '';

  readonly visible = signal(false);
  private entranceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.scheduleEntrance();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['promo'] || changes['eventoTitulo']) {
      this.scheduleEntrance();
    }
  }

  ngOnDestroy(): void {
    this.clearEntranceTimer();
  }

  formatCurrency(value: number): string {
    if (!value) return '$0';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }

  get ahorroFormatted(): string {
    return this.formatCurrency(this.promo?.ahorroMaximoUnitario ?? 0);
  }

  get precioDesdeFormatted(): string {
    return this.formatCurrency(this.promo?.precioPreventaDesde ?? 0);
  }

  get ctaLink(): string[] {
    return ['/detalle-evento', String(this.promo.eventoId)];
  }

  get ctaQueryParams(): { tab: string } {
    return { tab: 'productos' };
  }

  get hayMasEventosConPreventa(): boolean {
    return (this.promo?.totalEventosConPreventaLicor ?? 0) > 1;
  }

  verPreventa(): void {
    this.ocultarYMarcarSesion();
    void this.router.navigate(this.ctaLink, { queryParams: this.ctaQueryParams });
  }

  dismiss(): void {
    this.ocultarYMarcarSesion();
  }

  private ocultarYMarcarSesion(): void {
    this.visible.set(false);
    marcarPreventaLicorFlyerVistoEnSesion();
  }

  private scheduleEntrance(): void {
    this.clearEntranceTimer();
    if (!this.promo || preventaLicorFlyerVistoEnSesion()) {
      this.visible.set(false);
      return;
    }

    this.entranceTimer = setTimeout(() => {
      if (!preventaLicorFlyerVistoEnSesion()) {
        this.visible.set(true);
      }
    }, ENTRANCE_DELAY_MS);
  }

  private clearEntranceTimer(): void {
    if (this.entranceTimer != null) {
      clearTimeout(this.entranceTimer);
      this.entranceTimer = null;
    }
  }
}
