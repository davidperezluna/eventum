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
}
