import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { DashboardOrganizadorService } from '../../services/dashboard-organizador.service';
import { AuthService } from '../../services/auth.service';
import { DashboardStats } from '../../types';

@Component({
  selector: 'app-dashboard-organizador',
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard-organizador.html',
  styleUrl: './dashboard-organizador.css',
})
export class DashboardOrganizador implements OnInit {
  constructor(
    private dashboardService: DashboardOrganizadorService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}
  
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
  organizadorId: number | null = null;

  ngOnInit() {
    // Obtener el ID del organizador desde el usuario actual
    this.authService.usuario$.subscribe(usuario => {
      if (usuario && usuario.tipo_usuario_id === 2) {
        this.organizadorId = usuario.id;
        this.loadStats();
      } else {
        this.error = 'No se pudo identificar el organizador';
        this.loading = false;
      }
    });
  }

  loadStats() {
    if (!this.organizadorId) {
      this.error = 'ID de organizador no disponible';
      this.loading = false;
      return;
    }

    console.log('loadStats llamado para organizador:', this.organizadorId);
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();

    this.dashboardService.getStats(this.organizadorId).subscribe({
      next: (stats) => {
        console.log('Stats recibidas en componente organizador:', stats);
        this.stats = stats;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando estadísticas:', err);
        this.error = 'Error al cargar las estadísticas. Verifica tu conexión con Supabase.';
        this.loading = false;
        this.cdr.detectChanges();
      },
      complete: () => {
        console.log('Observable completado en dashboard organizador');
        this.cdr.detectChanges();
      }
    });
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

