import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { DashboardStats } from '../../types';
import { buildFinanzasOrganizadorView, formatFinanzasMontoExacto } from '../../utils/dashboard-finanzas.view';

@Component({
  selector: 'app-dashboard-finanzas-hero-organizador',
  imports: [CommonModule],
  templateUrl: './dashboard-finanzas-hero-organizador.html',
  styleUrl: './dashboard-finanzas-hero-organizador.css',
})
export class DashboardFinanzasHeroOrganizadorComponent {
  @Input({ required: true }) stats!: DashboardStats;
  @Input() mostrarProductos = true;

  formatAmount(value: number | null | undefined): string {
    return formatFinanzasMontoExacto(value);
  }

  get finanzas() {
    return buildFinanzasOrganizadorView(this.stats, this.mostrarProductos);
  }
}
