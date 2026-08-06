import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { DashboardStats } from '../../types';
import {
  getRecaudoBrutoConsolidado,
  getSaldoEstimadoRecibirConsolidado,
  formatFinanzasMontoExacto,
  formatFinanzasMonedaExacta,
} from '../../utils/dashboard-finanzas.view';

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
  /** completo = admin (finanzas + operativos); operativo = solo tarjetas operativas */
  @Input() modo: 'completo' | 'operativo' = 'completo';

  Math = Math;

  formatCurrency(value: number | null | undefined): string {
    return formatFinanzasMonedaExacta(value);
  }

  formatAmountNoCurrency(value: number | null | undefined): string {
    return formatFinanzasMontoExacto(value);
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
    return getRecaudoBrutoConsolidado(this.stats, this.mostrarProductos);
  }

  /** Neto post-Wompi consolidado (T − W) — KPI admin "Margen neto total". */
  get netoTotalConsolidado(): number {
    return Number(this.stats.neto_total_post_wompi_total || 0)
      + (this.mostrarProductos ? Number(this.stats.neto_productos_total_post_wompi_total || 0) : 0);
  }

  /** Neto empresario post-Wompi — mismo campo que "Saldo estimado a recibir" del organizador. */
  get netoEmpresarioConsolidado(): number {
    return getSaldoEstimadoRecibirConsolidado(this.stats, this.mostrarProductos);
  }

  get netoServicioTotalConsolidado(): number {
    return Number(this.stats.neto_servicio_post_wompi_total || 0)
      + (this.mostrarProductos ? Number(this.stats.neto_productos_servicio_post_wompi_total || 0) : 0);
  }
}
