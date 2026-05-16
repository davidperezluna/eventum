import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { DashboardStats } from '../../types';

@Component({
  selector: 'app-ingresos-resumen',
  imports: [CommonModule],
  templateUrl: './ingresos-resumen.html',
  styleUrl: './ingresos-resumen.css',
})
export class IngresosResumenComponent {
  @Input({ required: true }) stats!: DashboardStats;
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

  getVariacionPorcentual(actual: number, anterior: number): number {
    if (anterior === 0) {
      return actual > 0 ? 100 : 0;
    }

    return Math.round(((actual - anterior) / anterior) * 100);
  }
}
