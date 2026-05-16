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

  formatCurrency(value: number | null | undefined): string {
    const safeValue = value ?? 0;
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(safeValue);
  }
}
