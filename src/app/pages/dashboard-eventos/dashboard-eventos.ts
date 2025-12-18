import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { takeUntil, debounceTime, switchMap, catchError } from 'rxjs/operators';
import { DashboardService } from '../../services/dashboard.service';
import { DashboardOrganizadorService } from '../../services/dashboard-organizador.service';
import { ReportesService, ReporteVentas, ReporteAsistencia, ReporteEvento } from '../../services/reportes.service';
import { EventosService } from '../../services/eventos.service';
import { AuthService } from '../../services/auth.service';
import { DashboardStats, Evento } from '../../types';
import { DateFormatPipe } from '../../pipes/date-format.pipe';

@Component({
  selector: 'app-dashboard-eventos',
  imports: [CommonModule, FormsModule, RouterModule, DateFormatPipe],
  templateUrl: './dashboard-eventos.html',
  styleUrl: './dashboard-eventos.css',
})
export class DashboardEventos implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private loadReportesSubject = new Subject<void>();
  private unsubscribeAuthState?: () => void;

  stats: DashboardStats = {
    eventos_activos: 0,
    boletas_vendidas: 0,
    ingresos_totales: 0,
    clientes: 0,
    eventos_totales: 0,
    ingresos_mes_actual: 0,
    ingresos_mes_anterior: 0,
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
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // Verificar si es organizador
    this.unsubscribeAuthState = this.authService.onAuthStateChange((user, usuario, session) => {
      if (usuario && usuario.tipo_usuario_id === 2) {
        this.esOrganizador = true;
        this.organizadorId = usuario.id;
      }
      this.loadEventos();
      this.loadStats();
    });

    // Configurar debounce para loadReportes
    this.loadReportesSubject.pipe(
      debounceTime(300), // Esperar 300ms antes de ejecutar
      switchMap(() => {
        return this.loadReportesInternal();
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
        this.reporteEventoSeleccionado = result.reporteEvento;
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

  loadEventos() {
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
    
    this.eventosService.getEventos(filters).pipe(
      takeUntil(this.destroy$),
      catchError((err) => {
        console.error('Error cargando eventos:', err);
        // Si falla, intentar con menos eventos
        return this.eventosService.getEventos({ limit: 100, page: 1, activo: true }).pipe(
          catchError(() => of({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 }))
        );
      })
    ).subscribe({
      next: (response) => {
        if (this.esOrganizador && this.organizadorId) {
          this.eventos = (response.data || []).filter(e => e.organizador_id === this.organizadorId);
        } else {
          this.eventos = response.data || [];
        }
        this.cdr.detectChanges();
      }
    });
  }

  loadStats() {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();

    const stats$ = this.esOrganizador && this.organizadorId
      ? this.dashboardOrganizadorService.getStats(this.organizadorId)
      : this.dashboardService.getStats();

    stats$.pipe(
      takeUntil(this.destroy$),
      catchError((err) => {
        console.error('Error cargando estadísticas:', err);
        this.error = 'Error al cargar las estadísticas';
        this.loading = false;
        this.cdr.detectChanges();
        return of(this.stats);
      })
    ).subscribe({
      next: (stats) => {
        this.stats = stats;
        this.loading = false;
        this.loadReportes();
        this.cdr.detectChanges();
      }
    });
  }

  loadReportes() {
    // Disparar el Subject que tiene debounce
    this.loadReportesSubject.next();
  }

  private loadReportesInternal() {
    // Usar forkJoin para hacer todas las peticiones en paralelo y cancelar las anteriores
    const organizadorId = this.organizadorId || undefined;
    const fechaDesde = this.fechaDesde || undefined;
    const fechaHasta = this.fechaHasta || undefined;
    const eventoFiltro = this.eventoFiltro || undefined;

    return forkJoin({
      ventasPorDia: this.reportesService.getVentasPorDia(fechaDesde, fechaHasta, organizadorId).pipe(
        catchError((err) => {
          console.error('Error cargando ventas por día:', err);
          return of([]);
        })
      ),
      ventasPorMes: this.reportesService.getVentasPorMes(organizadorId).pipe(
        catchError((err) => {
          console.error('Error cargando ventas por mes:', err);
          return of([]);
        })
      ),
      asistenciaPorEvento: this.reportesService.getAsistenciaPorEvento(organizadorId, eventoFiltro).pipe(
        catchError((err) => {
          console.error('Error cargando asistencia:', err);
          return of([]);
        })
      ),
      ingresosPorEvento: this.reportesService.getIngresosPorEvento(organizadorId).pipe(
        catchError((err) => {
          console.error('Error cargando ingresos por evento:', err);
          return of([]);
        })
      ),
      distribucionMetodoPago: this.reportesService.getDistribucionMetodoPago(organizadorId).pipe(
        catchError((err) => {
          console.error('Error cargando distribución método pago:', err);
          return of([]);
        })
      ),
      reporteEvento: eventoFiltro 
        ? this.reportesService.getReporteEvento(eventoFiltro).pipe(
            catchError((err) => {
              console.error('Error cargando reporte evento:', err);
              return of(null);
            })
          )
        : of(null)
    }).pipe(
      takeUntil(this.destroy$)
    );
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
}

