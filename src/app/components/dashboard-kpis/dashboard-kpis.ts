import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { DashboardStats } from '../../types';

@Component({
  selector: 'app-dashboard-kpis',
  imports: [CommonModule],
  templateUrl: './dashboard-kpis.html',
  styleUrl: './dashboard-kpis.css',
})
export class DashboardKpisComponent {
  @Input({ required: true }) stats!: DashboardStats;
  @Input() eventosLabel = 'Eventos Activos';
  @Input() showIngresosVariacion = true;
  @Input() mostrarProductos = true;

  Math = Math;

  formatCurrency(value: number | null | undefined): string {
    const safeValue = value ?? 0;
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(safeValue);
  }

  formatAmountNoCurrency(value: number | null | undefined): string {
    const safeValue = value ?? 0;
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(safeValue);
  }

  formatNumber(value: number | null | undefined): string {
    const safeValue = value ?? 0;
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(safeValue);
  }

  getVariacionPorcentual(actual: number, anterior: number): number {
    if (anterior === 0) {
      return actual > 0 ? 100 : 0;
    }

    return Math.round(((actual - anterior) / anterior) * 100);
  }

  get ingresosTotalesBoletas(): number {
    return Number(this.stats.ingresos_totales || 0);
  }

  get ingresosTotalesProductos(): number {
    return Number(this.stats.ingresos_productos_totales || 0);
  }

  get ingresosTotalesGlobales(): number {
    return this.ingresosTotalesBoletas + (this.mostrarProductos ? this.ingresosTotalesProductos : 0);
  }

  get netoTotalConsolidado(): number {
    return Number(this.stats.neto_total_post_wompi_total || 0)
      + (this.mostrarProductos ? Number(this.stats.neto_productos_total_post_wompi_total || 0) : 0);
  }

  get netoServicioTotalConsolidado(): number {
    return Number(this.stats.neto_servicio_post_wompi_total || 0)
      + (this.mostrarProductos ? Number(this.stats.neto_productos_servicio_post_wompi_total || 0) : 0);
  }

  get mixBoletasPorcentaje(): number {
    const total = this.ingresosTotalesGlobales;
    if (total <= 0) return 0;
    if (!this.mostrarProductos) return 100;
    return Math.round((this.ingresosTotalesBoletas / total) * 100);
  }

  get mixProductosPorcentaje(): number {
    const total = this.ingresosTotalesGlobales;
    if (total <= 0) return 0;
    return Math.max(0, 100 - this.mixBoletasPorcentaje);
  }
}
