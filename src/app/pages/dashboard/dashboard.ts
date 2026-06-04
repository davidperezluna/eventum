import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { DashboardService } from '../../services/dashboard.service';
import { AppCacheService } from '../../services/app-cache.service';
import { AlertService } from '../../services/alert.service';
import { DashboardStats } from '../../types';
import { DateFormatPipe } from '../../pipes/date-format.pipe';
import { IngresosResumenComponent } from '../../components/ingresos-resumen/ingresos-resumen';
import { DashboardKpisComponent } from '../../components/dashboard-kpis/dashboard-kpis';
import { FinanzasDesgloseComponent } from '../../components/finanzas-desglose/finanzas-desglose';

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, RouterModule, DateFormatPipe, IngresosResumenComponent, DashboardKpisComponent, FinanzasDesgloseComponent],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css', '../finanzas-desglose-panel.css'],
})
export class Dashboard implements OnInit {
  private readonly cacheTtlMs = 60 * 1000;
  private currentUserId: number | null = null;
  isManualRefreshing = false;

  constructor(
    private dashboardService: DashboardService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private authService: AuthService,
    private appCacheService: AppCacheService,
    private alertService: AlertService
  ) { }

  stats: DashboardStats = {
    eventos_activos: 0,
    boletas_vendidas: 0,
    productos_vendidos: 0,
    pedidos_productos: 0,
    tiene_productos: false,
    ingresos_totales: 0,
    ingresos_productos_totales: 0,
    clientes: 0,
    ventas_recientes: [],
    eventos_proximos: [],
    eventos_totales: 0,
    categorias_activas: 0,
    lugares_activos: 0,
    ingresos_mes_actual: 0,
    ingresos_mes_anterior: 0,
    ingresos_dia_actual: 0,
    ingresos_dia_anterior: 0,
    porcentaje_servicio_promedio: 0,
    valor_servicio_total: 0,
    porcentaje_servicio_productos_promedio: 0,
    valor_servicio_productos_total: 0,
    ingresos_ventas_bruto_total: 0,
    ingresos_productos_bruto_total: 0,
    wompi_total_estimado: 0,
    wompi_productos_total_estimado: 0,
    wompi_ventas_total: 0,
    wompi_productos_ventas_total: 0,
    wompi_servicio_total: 0,
    wompi_productos_servicio_total: 0,
    neto_ventas_post_wompi_total: 0,
    neto_productos_ventas_post_wompi_total: 0,
    neto_servicio_post_wompi_total: 0,
    neto_productos_servicio_post_wompi_total: 0,
    neto_total_post_wompi_total: 0,
    neto_productos_total_post_wompi_total: 0,
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
    this.currentUserId = this.authService.getUsuarioId();
    const cached = this.getCachedState();
    if (cached) {
      this.stats = cached.stats;
      this.loading = false;
      this.cdr.detectChanges();
    } else {
      this.loading = true;
    }
    void this.loadStats({ background: !!cached });
  }

  async loadStats(options?: { background?: boolean; manual?: boolean }) {
    const hasVisibleData = !this.loading;
    const background = options?.background ?? hasVisibleData;
    const manual = options?.manual ?? false;
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;

    if (offline && hasVisibleData) {
      console.info('[DashboardAdmin] Sin conexión, usando datos cacheados');
      if (manual) {
        void this.alertService.snackbar('Sin conexión. Mostrando datos guardados.');
      }
      return;
    }

    if (manual && this.isManualRefreshing) return;
    if (manual) {
      this.isManualRefreshing = true;
      this.cdr.detectChanges();
    }
    const startedAt = Date.now();

    console.log('[DashboardAdmin] Carga iniciada', { background });
    this.loading = !background && !hasVisibleData;
    this.error = null;
    this.cdr.detectChanges();

    try {
      const stats = await this.dashboardService.getStats();
      this.stats = stats;
      this.loading = false;
      this.persistState();
      if (manual) {
        void this.alertService.snackbarSuccess('Dashboard actualizado', 'Los datos se recargaron correctamente.');
      }
      console.log('[DashboardAdmin] Carga finalizada', {
        background,
        durationMs: Date.now() - startedAt
      });
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando estadísticas:', err);
      this.error = 'Error al cargar las estadísticas. Verifica tu conexión con Supabase.';
      this.loading = false;
      if (manual) {
        void this.alertService.snackbarError('No se pudo recargar', 'Ocurrió un error al actualizar el dashboard.');
      }
      console.log('[DashboardAdmin] Carga fallida', {
        background,
        durationMs: Date.now() - startedAt
      });
      this.cdr.detectChanges();
    } finally {
      if (manual) {
        this.isManualRefreshing = false;
        this.cdr.detectChanges();
      }
    }
  }

  private get cacheKey(): string | null {
    if (!this.currentUserId) return null;
    return `eventum:cache:v1:dashboard-admin:user:${this.currentUserId}`;
  }

  private getCachedState(): { stats: DashboardStats; lastUpdated: number } | null {
    const key = this.cacheKey;
    if (!key) return null;
    const cached = this.appCacheService.get<{ stats: DashboardStats; lastUpdated: number }>(key, 'session');
    if (!cached) return null;
    if (Date.now() - cached.lastUpdated > this.cacheTtlMs) return null;
    return cached;
  }

  private persistState(): void {
    const key = this.cacheKey;
    if (!key) return;
    this.appCacheService.set(key, {
      stats: this.stats,
      lastUpdated: Date.now()
    }, 'session');
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
