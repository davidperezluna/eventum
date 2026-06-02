import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { DashboardStats } from '../../types';

@Component({
  selector: 'app-finanzas-desglose',
  imports: [CommonModule],
  templateUrl: './finanzas-desglose.html',
  styleUrls: ['./finanzas-desglose.css', '../../pages/finanzas-desglose-panel.css'],
})
export class FinanzasDesgloseComponent {
  @Input({ required: true }) stats!: DashboardStats;
  @Input() clienteSubtext = 'Ventas de boletas y neto del organizador tras Wompi sobre ese rubro.';
  @Input() mostrarProductos = true;
  viewMode: 'todo' | 'boletas' | 'productos' = 'boletas';

  formatCurrency(value: number | null | undefined): string {
    const safeValue = value ?? 0;
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(safeValue);
  }

  setViewMode(mode: 'todo' | 'boletas' | 'productos'): void {
    if (!this.mostrarProductos && mode !== 'boletas') {
      this.viewMode = 'boletas';
      return;
    }
    this.viewMode = mode;
  }

  get showBoletas(): boolean {
    return this.viewMode === 'todo' || this.viewMode === 'boletas';
  }

  get showProductos(): boolean {
    if (!this.mostrarProductos) return false;
    return this.viewMode === 'todo' || this.viewMode === 'productos';
  }

  get wompiTotalVisible(): number {
    if (!this.mostrarProductos) return Number(this.stats.wompi_total_estimado || 0);
    if (this.viewMode === 'boletas') return Number(this.stats.wompi_total_estimado || 0);
    if (this.viewMode === 'productos') return Number(this.stats.wompi_productos_total_estimado || 0);
    return Number(this.stats.wompi_total_estimado || 0) + Number(this.stats.wompi_productos_total_estimado || 0);
  }

  get netoTotalVisible(): number {
    if (!this.mostrarProductos) return Number(this.stats.neto_total_post_wompi_total || 0);
    if (this.viewMode === 'boletas') return Number(this.stats.neto_total_post_wompi_total || 0);
    if (this.viewMode === 'productos') return Number(this.stats.neto_productos_total_post_wompi_total || 0);
    return Number(this.stats.neto_total_post_wompi_total || 0) + Number(this.stats.neto_productos_total_post_wompi_total || 0);
  }

  get totalLabelSuffix(): string {
    if (!this.mostrarProductos) return 'boletas';
    if (this.viewMode === 'boletas') return 'boletas';
    if (this.viewMode === 'productos') return 'productos';
    return 'boletas + productos';
  }
}
