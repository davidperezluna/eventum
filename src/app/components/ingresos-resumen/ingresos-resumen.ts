import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { DashboardStats } from '../../types';
import { formatFinanzasMonedaExacta } from '../../utils/dashboard-finanzas.view';

@Component({
  selector: 'app-ingresos-resumen',
  imports: [CommonModule],
  templateUrl: './ingresos-resumen.html',
  styleUrl: './ingresos-resumen.css',
})
export class IngresosResumenComponent {
  @Input({ required: true }) stats!: DashboardStats;
  /** Ajusta copy cuando el bloque es contexto de recaudo bruto, no saldo del empresario. */
  @Input() contextoOrganizador = false;
  /** Si el bloque expandible inicia abierto. */
  @Input() defaultOpen = true;
  Math = Math;

  formatCurrency(value: number | null | undefined): string {
    return formatFinanzasMonedaExacta(value);
  }

  getVariacionPorcentual(actual: number, anterior: number): number {
    if (anterior === 0) {
      return actual > 0 ? 100 : 0;
    }

    return Math.round(((actual - anterior) / anterior) * 100);
  }
}
