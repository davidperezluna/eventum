import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subject, from } from 'rxjs';
import { takeUntil, debounceTime, switchMap } from 'rxjs/operators';
import { DashboardService } from '../../services/dashboard.service';
import { DashboardOrganizadorService } from '../../services/dashboard-organizador.service';
import { ReportesService, ReporteVentas, ReporteAsistencia, ReporteEvento } from '../../services/reportes.service';
import { EventosService } from '../../services/eventos.service';
import { AuthService } from '../../services/auth.service';
import { AppCacheService } from '../../services/app-cache.service';
import { AlertService } from '../../services/alert.service';
import { DashboardStats, Evento } from '../../types';
import { DateFormatPipe } from '../../pipes/date-format.pipe';
import { IngresosResumenComponent } from '../../components/ingresos-resumen/ingresos-resumen';
import { DashboardKpisComponent } from '../../components/dashboard-kpis/dashboard-kpis';
import { FinanzasDesgloseComponent } from '../../components/finanzas-desglose/finanzas-desglose';

@Component({
  selector: 'app-dashboard-eventos',
  imports: [CommonModule, FormsModule, RouterModule, DateFormatPipe, IngresosResumenComponent, DashboardKpisComponent, FinanzasDesgloseComponent],
  templateUrl: './dashboard-eventos.html',
  styleUrls: ['./dashboard-eventos.css', '../finanzas-desglose-panel.css'],
})
export class DashboardEventos implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private loadReportesSubject = new Subject<void>();
  private unsubscribeAuthState?: () => void;
  private readonly cacheTtlMs = 60 * 1000;
  private currentCacheUserId: number | null = null;
  private hasStatsData = false;

  stats: DashboardStats = {
    eventos_activos: 0,
    boletas_vendidas: 0,
    ingresos_totales: 0,
    clientes: 0,
    eventos_totales: 0,
    ingresos_mes_actual: 0,
    ingresos_mes_anterior: 0,
    ingresos_dia_actual: 0,
    ingresos_dia_anterior: 0,
    porcentaje_servicio_promedio: 0,
    valor_servicio_total: 0,
    ingresos_ventas_bruto_total: 0,
    wompi_total_estimado: 0,
    wompi_ventas_total: 0,
    wompi_servicio_total: 0,
    neto_ventas_post_wompi_total: 0,
    neto_servicio_post_wompi_total: 0,
    neto_total_post_wompi_total: 0,
    boletas_por_estado: [],
    top_eventos: []
  };

  loading = true;
  error: string | null = null;
  organizadorId: number | null = null;
  esOrganizador = false;

  // Filtros
  eventoFiltro: number | null = null;
  fechaDesde: string = '';
  fechaHasta: string = '';
  eventos: Evento[] = [];

  // Reportes
  ventasPorDia: ReporteVentas[] = [];
  ventasPorMes: { mes: string; ventas: number; ingresos: number }[] = [];
  asistenciaPorEvento: ReporteAsistencia[] = [];
  ingresosPorEvento: { evento_id: number; evento_titulo: string; ingresos: number; boletas_vendidas: number }[] = [];
  distribucionMetodoPago: { metodo: string; cantidad: number; porcentaje: number }[] = [];
  distribucionTipoBoleta: { tipo: string; cantidad: number; porcentaje: number }[] = [];
  reporteEventoSeleccionado: ReporteEvento | null = null;

  // Paginación para tablas
  asistenciaPage = 1;
  asistenciaLimit = 10;
  asistenciaTotal = 0;
  
  ingresosPage = 1;
  ingresosLimit = 10;
  ingresosTotal = 0;

  // Tabs
  tabActivo: 'general' | 'ventas' | 'asistencia' | 'eventos' = 'general';

  constructor(
    private dashboardService: DashboardService,
    private dashboardOrganizadorService: DashboardOrganizadorService,
    private reportesService: ReportesService,
    private eventosService: EventosService,
    private authService: AuthService,
    private appCacheService: AppCacheService,
    private alertService: AlertService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // Verificar si es organizador
    this.unsubscribeAuthState = this.authService.onAuthStateChange((user, usuario, session) => {
      const incomingUserId = usuario?.id ?? this.authService.getUsuarioId();
      const userChanged = incomingUserId !== this.currentCacheUserId;
      let usedCache = false;

      if (userChanged) {
        this.currentCacheUserId = incomingUserId ?? null;
        const cached = this.getCachedState();
        if (cached) {
          this.applyCachedState(cached);
          this.loading = false;
          this.hasStatsData = true;
          usedCache = true;
        } else {
          this.loading = true;
        }
      }

      if (usuario && usuario.tipo_usuario_id === 2) {
        this.esOrganizador = true;
        this.organizadorId = usuario.id;
      } else if (usuario) {
        this.esOrganizador = false;
        this.organizadorId = null;
      }
      void this.loadEventos({ background: usedCache || this.eventos.length > 0 });
      void this.loadStats({ background: usedCache || this.hasStatsData });
    });

    // Configurar debounce para loadReportes
    this.loadReportesSubject.pipe(
      debounceTime(300), // Esperar 300ms antes de ejecutar
      switchMap(() => {
        return from(this.loadReportesInternal());
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (result) => {
        // Asignar los datos del resultado
        this.ventasPorDia = result.ventasPorDia;
        this.ventasPorMes = result.ventasPorMes;
        this.asistenciaPorEvento = result.asistenciaPorEvento;
        this.asistenciaTotal = result.asistenciaPorEvento.length;
        this.asistenciaPage = 1;
        this.ingresosPorEvento = result.ingresosPorEvento;
        this.ingresosTotal = result.ingresosPorEvento.length;
        this.ingresosPage = 1;
        this.distribucionMetodoPago = result.distribucionMetodoPago;
        this.distribucionTipoBoleta = result.distribucionTipoBoleta;
        this.reporteEventoSeleccionado = result.reporteEvento;
        this.persistState();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error en loadReportes:', err);
        this.cdr.detectChanges();
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.unsubscribeAuthState) {
      this.unsubscribeAuthState();
    }
  }

  async loadEventos(_options?: { background?: boolean }) {
    // Para el selector de eventos, no necesitamos todos, solo los activos y publicados
    // Reducir el límite y optimizar la consulta
    const filters: any = {
      limit: 500, // Reducido de 1000
      page: 1,
      activo: true,
      estado: 'publicado'
    };
    
    if (this.esOrganizador && this.organizadorId) {
      filters.organizador_id = this.organizadorId;
    }
    
    try {
      const response = await this.eventosService.getEventos(filters);
      if (this.esOrganizador && this.organizadorId) {
        this.eventos = (response.data || []).filter(e => e.organizador_id === this.organizadorId);
      } else {
        this.eventos = response.data || [];
      }
      this.persistState();
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando eventos:', err);
      // Si falla, intentar con menos eventos
      try {
        const response = await this.eventosService.getEventos({ limit: 100, page: 1, activo: true });
        if (this.esOrganizador && this.organizadorId) {
          this.eventos = (response.data || []).filter(e => e.organizador_id === this.organizadorId);
        } else {
          this.eventos = response.data || [];
        }
        this.persistState();
        this.cdr.detectChanges();
      } catch {
        this.eventos = [];
        this.cdr.detectChanges();
      }
    }
  }

  async loadStats(options?: { background?: boolean; manual?: boolean }) {
    const hasVisibleData = this.hasStatsData;
    const background = options?.background ?? hasVisibleData;
    const manual = options?.manual ?? false;
    const startedAt = Date.now();

    console.info('[DashboardEventos] Refresco iniciado', {
      background,
      organizadorId: this.organizadorId ?? null
    });

    this.loading = !background && !hasVisibleData;
    this.error = null;
    this.cdr.detectChanges();

    try {
      const stats = this.esOrganizador && this.organizadorId
        ? await this.dashboardOrganizadorService.getStats(this.organizadorId)
        : await this.dashboardService.getStats();
      
      this.stats = stats;
      this.hasStatsData = true;
      this.loading = false;
      this.persistState();
      this.loadReportes();
      if (manual) {
        void this.alertService.snackbarSuccess('Dashboard actualizado', 'Los reportes y KPIs se recargaron correctamente.');
      }
      console.info('[DashboardEventos] Refresco finalizado', {
        background,
        durationMs: Date.now() - startedAt
      });
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando estadísticas:', err);
      this.error = 'Error al cargar las estadísticas';
      this.loading = false;
      if (manual) {
        void this.alertService.snackbarError('No se pudo recargar', 'Ocurrió un error al actualizar el dashboard de eventos.');
      }
      console.info('[DashboardEventos] Refresco fallido', {
        background,
        durationMs: Date.now() - startedAt
      });
      this.cdr.detectChanges();
    }
  }

  loadReportes() {
    // Disparar el Subject que tiene debounce
    this.loadReportesSubject.next();
  }

  private async loadReportesInternal() {
    // Usar Promise.all para hacer todas las peticiones en paralelo
    const organizadorId = this.organizadorId || undefined;
    const fechaDesde = this.fechaDesde || undefined;
    const fechaHasta = this.fechaHasta || undefined;
    const eventoFiltro = this.eventoFiltro || undefined;

    try {
      const [
        ventasPorDia,
        ventasPorMes,
        asistenciaPorEvento,
        ingresosPorEvento,
        distribucionMetodoPago,
        distribucionTipoBoleta,
        reporteEvento
      ] = await Promise.all([
        this.reportesService.getVentasPorDia(fechaDesde, fechaHasta, organizadorId).catch((err) => {
          console.error('Error cargando ventas por día:', err);
          return [];
        }),
        this.reportesService.getVentasPorMes(organizadorId).catch((err) => {
          console.error('Error cargando ventas por mes:', err);
          return [];
        }),
        this.reportesService.getAsistenciaPorEvento(organizadorId, eventoFiltro).catch((err) => {
          console.error('Error cargando asistencia:', err);
          return [];
        }),
        this.reportesService.getIngresosPorEvento(organizadorId).catch((err) => {
          console.error('Error cargando ingresos por evento:', err);
          return [];
        }),
        this.reportesService.getDistribucionMetodoPago(organizadorId).catch((err) => {
          console.error('Error cargando distribución método pago:', err);
          return [];
        }),
        this.reportesService.getDistribucionTipoBoleta(organizadorId).catch((err) => {
          console.error('Error cargando distribución tipo boleta:', err);
          return [];
        }),
        eventoFiltro 
          ? this.reportesService.getReporteEvento(eventoFiltro).catch((err) => {
              console.error('Error cargando reporte evento:', err);
              return null;
            })
          : Promise.resolve(null)
      ]);

      return {
        ventasPorDia,
        ventasPorMes,
        asistenciaPorEvento,
        ingresosPorEvento,
        distribucionMetodoPago,
        distribucionTipoBoleta,
        reporteEvento
      };
    } catch (error) {
      console.error('Error general cargando reportes:', error);
      return {
        ventasPorDia: [],
        ventasPorMes: [],
        asistenciaPorEvento: [],
        ingresosPorEvento: [],
        distribucionMetodoPago: [],
        distribucionTipoBoleta: [],
        reporteEvento: null
      };
    }
  }

  aplicarFiltros() {
    this.loadReportes();
  }

  limpiarFiltros() {
    this.eventoFiltro = null;
    this.fechaDesde = '';
    this.fechaHasta = '';
    this.loadReportes();
  }

  cambiarTab(tab: 'general' | 'ventas' | 'asistencia' | 'eventos') {
    this.tabActivo = tab;
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

  getMaxValue(data: any[], field: string): number {
    if (!data || data.length === 0) return 0;
    return Math.max(...data.map(item => item[field] || 0));
  }

  getBarWidth(value: number, max: number): string {
    if (max === 0) return '0%';
    return `${(value / max) * 100}%`;
  }

  // Métodos de paginación para asistencia
  getAsistenciaTotalPages(): number {
    return Math.ceil(this.asistenciaTotal / this.asistenciaLimit);
  }

  getAsistenciaPageNumbers(): number[] {
    const totalPages = this.getAsistenciaTotalPages();
    const pages: number[] = [];
    const maxPages = 5;
    
    if (totalPages <= maxPages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      let start = Math.max(1, this.asistenciaPage - 2);
      let end = Math.min(totalPages, start + maxPages - 1);
      
      if (end - start < maxPages - 1) {
        start = Math.max(1, end - maxPages + 1);
      }
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
    }
    
    return pages;
  }

  goToAsistenciaPage(pageNum: number) {
    if (pageNum >= 1 && pageNum <= this.getAsistenciaTotalPages()) {
      this.asistenciaPage = pageNum;
      this.loadReportes();
    }
  }

  getAsistenciaPaginated(): ReporteAsistencia[] {
    const start = (this.asistenciaPage - 1) * this.asistenciaLimit;
    const end = start + this.asistenciaLimit;
    return this.asistenciaPorEvento.slice(start, end);
  }

  // Métodos de paginación para ingresos
  getIngresosTotalPages(): number {
    return Math.ceil(this.ingresosTotal / this.ingresosLimit);
  }

  getIngresosPageNumbers(): number[] {
    const totalPages = this.getIngresosTotalPages();
    const pages: number[] = [];
    const maxPages = 5;
    
    if (totalPages <= maxPages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      let start = Math.max(1, this.ingresosPage - 2);
      let end = Math.min(totalPages, start + maxPages - 1);
      
      if (end - start < maxPages - 1) {
        start = Math.max(1, end - maxPages + 1);
      }
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
    }
    
    return pages;
  }

  goToIngresosPage(pageNum: number) {
    if (pageNum >= 1 && pageNum <= this.getIngresosTotalPages()) {
      this.ingresosPage = pageNum;
      this.loadReportes();
    }
  }

  getIngresosPaginated(): { evento_id: number; evento_titulo: string; ingresos: number; boletas_vendidas: number }[] {
    const start = (this.ingresosPage - 1) * this.ingresosLimit;
    const end = start + this.ingresosLimit;
    return this.ingresosPorEvento.slice(start, end);
  }

  Math = Math;

  private get cacheKey(): string | null {
    if (!this.currentCacheUserId) return null;
    return `eventum:cache:v1:dashboard-eventos:user:${this.currentCacheUserId}`;
  }

  private getCachedState(): any | null {
    const key = this.cacheKey;
    if (!key) return null;
    const cached = this.appCacheService.get<any>(key, 'session');
    if (!cached) return null;
    if (Date.now() - Number(cached.lastUpdated || 0) > this.cacheTtlMs) return null;
    return cached;
  }

  private applyCachedState(state: any): void {
    this.stats = state.stats || this.stats;
    this.eventos = state.eventos || [];
    this.ventasPorDia = state.ventasPorDia || [];
    this.ventasPorMes = state.ventasPorMes || [];
    this.asistenciaPorEvento = state.asistenciaPorEvento || [];
    this.asistenciaTotal = state.asistenciaTotal || this.asistenciaPorEvento.length;
    this.asistenciaPage = state.asistenciaPage || 1;
    this.ingresosPorEvento = state.ingresosPorEvento || [];
    this.ingresosTotal = state.ingresosTotal || this.ingresosPorEvento.length;
    this.ingresosPage = state.ingresosPage || 1;
    this.distribucionMetodoPago = state.distribucionMetodoPago || [];
    this.distribucionTipoBoleta = state.distribucionTipoBoleta || [];
    this.reporteEventoSeleccionado = state.reporteEventoSeleccionado || null;
    this.tabActivo = state.tabActivo || 'general';
    this.eventoFiltro = state.eventoFiltro ?? null;
    this.fechaDesde = state.fechaDesde || '';
    this.fechaHasta = state.fechaHasta || '';
    this.esOrganizador = state.esOrganizador ?? this.esOrganizador;
    this.organizadorId = state.organizadorId ?? this.organizadorId;
  }

  private persistState(): void {
    const key = this.cacheKey;
    if (!key) return;
    this.appCacheService.set(key, {
      stats: this.stats,
      eventos: this.eventos,
      ventasPorDia: this.ventasPorDia,
      ventasPorMes: this.ventasPorMes,
      asistenciaPorEvento: this.asistenciaPorEvento,
      asistenciaTotal: this.asistenciaTotal,
      asistenciaPage: this.asistenciaPage,
      ingresosPorEvento: this.ingresosPorEvento,
      ingresosTotal: this.ingresosTotal,
      ingresosPage: this.ingresosPage,
      distribucionMetodoPago: this.distribucionMetodoPago,
      distribucionTipoBoleta: this.distribucionTipoBoleta,
      reporteEventoSeleccionado: this.reporteEventoSeleccionado,
      tabActivo: this.tabActivo,
      eventoFiltro: this.eventoFiltro,
      fechaDesde: this.fechaDesde,
      fechaHasta: this.fechaHasta,
      esOrganizador: this.esOrganizador,
      organizadorId: this.organizadorId,
      lastUpdated: Date.now()
    }, 'session');
  }
}

