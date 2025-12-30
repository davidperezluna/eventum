import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { DashboardService } from '../../services/dashboard.service';
import { DashboardStats } from '../../types';
import { DateFormatPipe } from '../../pipes/date-format.pipe';

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, RouterModule, DateFormatPipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit {
  constructor(
    private dashboardService: DashboardService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private authService: AuthService
  ) { }

  stats: DashboardStats = {
    eventos_activos: 0,
    boletas_vendidas: 0,
    ingresos_totales: 0,
    clientes: 0,
    ventas_recientes: [],
    eventos_proximos: [],
    eventos_totales: 0,
    categorias_activas: 0,
    lugares_activos: 0,
    ingresos_mes_actual: 0,
    ingresos_mes_anterior: 0,
    boletas_por_estado: [],
    top_eventos: []
  };

  loading = true;
  error: string | null = null;

  ngOnInit() {
    // Si es cliente, redirigir inmediatamente a la vista de eventos
    if (this.authService.isCliente()) {
      this.router.navigate(['/eventos-cliente']);
      return;
    }
    this.loadStats();
  }

  async loadStats() {
    console.log('loadStats llamado');
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();

    try {
      const stats = await this.dashboardService.getStats();
      console.log('Stats recibidas en componente:', stats);
      this.stats = stats;
      this.loading = false;
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando estadísticas:', err);
      this.error = 'Error al cargar las estadísticas. Verifica tu conexión con Supabase.';
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  getVariacionPorcentual(actual: number, anterior: number): number {
    if (anterior === 0) return actual > 0 ? 100 : 0;
    return Math.round(((actual - anterior) / anterior) * 100);
  }

  getEstadoBoletaLabel(estado: string): string {
    const estados: { [key: string]: string } = {
      'pendiente': 'Pendiente',
      'usada': 'Usada',
      'cancelada': 'Cancelada',
      'reembolsada': 'Reembolsada'
    };
    return estados[estado] || estado;
  }

  Math = Math;
}
