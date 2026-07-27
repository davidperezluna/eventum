import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subject, from } from 'rxjs';
import { takeUntil, debounceTime, switchMap } from 'rxjs/operators';
import { ComprasService } from '../../services/compras.service';
import { EventosService } from '../../services/eventos.service';
import { UsuariosService } from '../../services/usuarios.service';
import { AlertService } from '../../services/alert.service';
import { AuthService } from '../../services/auth.service';
import { AppCacheService } from '../../services/app-cache.service';
import { ExcelExportService } from '../../services/excel-export.service';
import { DashboardService } from '../../services/dashboard.service';
import { DashboardOrganizadorService } from '../../services/dashboard-organizador.service';
import {
  ReportesService,
  ReporteAsistencia,
  ReporteVentas,
} from '../../services/reportes.service';
import { Compra, DashboardStats, Evento, Usuario } from '../../types';
import { DateFormatPipe } from '../../pipes/date-format.pipe';
import { IngresosResumenComponent } from '../../components/ingresos-resumen/ingresos-resumen';
import { DashboardKpisComponent } from '../../components/dashboard-kpis/dashboard-kpis';
import { FinanzasDesgloseComponent } from '../../components/finanzas-desglose/finanzas-desglose';
import {
  repartoWompiPorCompra,
  WOMPI_IVA,
} from '../../utils/wompi-finanzas';

@Component({
  selector: 'app-reportes',
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    DateFormatPipe,
    IngresosResumenComponent,
    DashboardKpisComponent,
    FinanzasDesgloseComponent,
  ],
  templateUrl: './reportes.html',
  styleUrls: ['reportes.css', '../dashboard-eventos/dashboard-eventos.css', '../finanzas-desglose-panel.css'],
})
export class Reportes implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private loadReportesSubject = new Subject<void>();
  private unsubscribeAuth?: () => void;
  private readonly cacheTtlMs = 60 * 1000;
  private currentCacheUserId: number | null = null;
  private hasStatsData = false;

  stats: DashboardStats = this.emptyStats();
  loading = true;
  loadingEventos = false;
  loadingOrganizadores = false;
  isManualRefreshing = false;
  error: string | null = null;
  
  esAdministrador = false;
  esOrganizador = false;
  organizadorId: number | null = null;
  /** Solo admin: filtrar por organizador (opcional). */
  organizadorFiltroAdmin: number | null = null;

  eventoFiltro: number | null = null;
  fechaDesde = '';
  fechaHasta = '';
  eventos: Evento[] = [];
  organizadores: Usuario[] = [];
  filtrosExpandidos = false;

  tabActivo: 'general' | 'ventas' | 'asistencia' | 'comisiones' = 'general';

  ventasPorDia: ReporteVentas[] = [];
  ventasPorMes: { mes: string; ventas: number; ingresos: number }[] = [];
  asistenciaPorEvento: ReporteAsistencia[] = [];
  ingresosPorEvento: { evento_id: number; evento_titulo: string; ingresos: number; boletas_vendidas: number }[] = [];
  distribucionMetodoPago: { metodo: string; cantidad: number; porcentaje: number }[] = [];
  distribucionTipoBoleta: { tipo: string; cantidad: number; porcentaje: number }[] = [];

  reporteComisiones: {
    totalBruto: number;
    totalComision: number;
    totalIVA: number;
    totalNeto: number;
    porEvento: Array<{
      eventoId: number;
      eventoTitulo: string;
      transacciones: number;
      bruto: number;
      comision: number;
      iva: number;
      neto: number;
    }>;
  } | null = null;

  asistenciaPage = 1;
  asistenciaLimit = 10;
  asistenciaTotal = 0;
  ingresosPage = 1;
  ingresosLimit = 10;
  ingresosTotal = 0;

  Math = Math;

  constructor(
    private comprasService: ComprasService,
    private eventosService: EventosService,
    private usuariosService: UsuariosService,
    private alertService: AlertService,
    private authService: AuthService,
    private appCacheService: AppCacheService,
    private excelExportService: ExcelExportService,
    private dashboardService: DashboardService,
    private dashboardOrganizadorService: DashboardOrganizadorService,
    private reportesService: ReportesService,
    private cdr: ChangeDetectorRef
  ) {}
  
  ngOnInit(): void {
    this.loadReportesSubject
      .pipe(
        debounceTime(300),
        switchMap(() => from(this.loadReportesInternal())),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (result) => {
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
          this.persistState();
          this.cdr.detectChanges();
        },
        error: (err) => console.error('[Reportes] Error cargando reportes:', err),
      });

    this.unsubscribeAuth = this.authService.onAuthStateChange((_user, usuario) => {
      if (!usuario) {
        return;
      }
      
      const incomingUserId = usuario.id ?? this.authService.getUsuarioId();
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

      this.esAdministrador = usuario.tipo_usuario_id === 3;
      this.esOrganizador = usuario.tipo_usuario_id === 2;
      if (this.esOrganizador) {
        this.organizadorId = usuario.id;
      } else {
        this.organizadorId = null;
      }
      if (this.esAdministrador) {
        void this.cargarOrganizadores();
      }
      void this.loadEventos({ background: usedCache || this.eventos.length > 0 });
      void this.recargarTodo({ background: usedCache || this.hasStatsData });
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
      if (this.unsubscribeAuth) {
        this.unsubscribeAuth();
    }
  }

  /** ID de organizador para consultas (organizador logueado o filtro admin). */
  get organizadorConsultaId(): number | undefined {
    if (this.esOrganizador && this.organizadorId) {
      return this.organizadorId;
    }
    if (this.esAdministrador && this.organizadorFiltroAdmin) {
      return this.organizadorFiltroAdmin;
    }
    return undefined;
  }

  get tieneFiltrosActivos(): boolean {
    return !!(this.eventoFiltro || this.fechaDesde || this.fechaHasta || this.organizadorFiltroAdmin);
  }

  get cantidadFiltrosActivos(): number {
    let count = 0;
    if (this.organizadorFiltroAdmin) count++;
    if (this.eventoFiltro) count++;
    if (this.fechaDesde) count++;
    if (this.fechaHasta) count++;
    return count;
  }

  get ventasPorDiaUsaUltimaSemana(): boolean {
    return !this.fechaDesde && !this.fechaHasta;
  }

  get resumenFiltros(): string {
    const partes: string[] = [];
    if (this.esAdministrador) {
      if (this.organizadorFiltroAdmin) {
        const org = this.organizadores.find((o) => o.id === this.organizadorFiltroAdmin);
        partes.push(org ? `${org.nombre} ${org.apellido || ''}`.trim() : 'Organizador');
      } else {
        partes.push('Todos los organizadores');
      }
    }
    if (this.eventoFiltro) {
      const evento = this.eventos.find((e) => e.id === this.eventoFiltro);
      const titulo = evento?.titulo?.trim() ?? 'Evento';
      partes.push(titulo.length > 28 ? `${titulo.slice(0, 28)}…` : titulo);
    } else {
      partes.push('Todos los eventos');
    }
    if (this.fechaDesde && this.fechaHasta) {
      partes.push(`${this.formatFiltroFecha(this.fechaDesde)} – ${this.formatFiltroFecha(this.fechaHasta)}`);
    } else if (this.fechaDesde) {
      partes.push(`Desde ${this.formatFiltroFecha(this.fechaDesde)}`);
    } else if (this.fechaHasta) {
      partes.push(`Hasta ${this.formatFiltroFecha(this.fechaHasta)}`);
    } else if (!this.eventoFiltro) {
      partes.push('cualquier fecha');
    }
    return partes.join(' · ');
  }

  toggleFiltros(): void {
    this.filtrosExpandidos = !this.filtrosExpandidos;
  }

  onOrganizadorChange(): void {
    this.eventoFiltro = null;
    void this.loadEventos();
  }

  buscarReportes(): void {
    this.filtrosExpandidos = false;
    void this.recargarTodo({ background: true, reloadReportes: true, searching: true });
  }

  limpiarFiltros(): void {
    this.eventoFiltro = null;
    this.fechaDesde = '';
    this.fechaHasta = '';
    if (this.esAdministrador) {
      this.organizadorFiltroAdmin = null;
    }
    void this.loadEventos();
    this.buscarReportes();
  }

  cambiarTab(tab: 'general' | 'ventas' | 'asistencia' | 'comisiones'): void {
    this.tabActivo = tab;
    this.persistState();
  }

  async recargarTodo(options?: {
    background?: boolean;
    manual?: boolean;
    reloadReportes?: boolean;
    searching?: boolean;
  }): Promise<void> {
    const hasVisibleData = this.hasStatsData;
    const background = options?.background ?? hasVisibleData;
    const manual = options?.manual ?? false;
    const searching = options?.searching ?? false;
    const reloadReportes = options?.reloadReportes ?? true;
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;

    if (offline && hasVisibleData) {
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

    this.loading = searching || (!background && !hasVisibleData);
    this.error = null;
    this.cdr.detectChanges();
    
    try {
      const eventoId = this.eventoFiltro || undefined;
      const orgId = this.organizadorConsultaId;

      this.stats =
        orgId != null
          ? await this.dashboardOrganizadorService.getStats(orgId, eventoId)
          : await this.dashboardService.getStats(eventoId);

      this.hasStatsData = true;

      if (reloadReportes) {
        this.loadReportes();
      }
      await this.loadComisionesReporte();
      this.persistState();
    } catch (err) {
      console.error('[Reportes] Error recargando:', err);
      this.error = 'No se pudieron cargar los reportes';
      if (manual) {
        void this.alertService.snackbarError('Error', 'No se pudieron recargar los reportes.');
      }
    } finally {
      this.loading = false;
      if (manual) {
        this.isManualRefreshing = false;
        void this.alertService.snackbarSuccess('Actualizado', 'Los reportes se recargaron.');
      }
      this.cdr.detectChanges();
    }
  }

  loadReportes(): void {
    this.loadReportesSubject.next();
  }

  private async loadReportesInternal() {
    const organizadorId = this.organizadorConsultaId;
    const eventoFiltro = this.eventoFiltro || undefined;
    const { desde: ventasDiaDesde, hasta: ventasDiaHasta } = this.rangoVentasPorDia();

    const [
      ventasPorDia,
      ventasPorMes,
      asistenciaPorEvento,
      ingresosPorEvento,
      distribucionMetodoPago,
      distribucionTipoBoleta,
    ] = await Promise.all([
      this.reportesService.getVentasPorDia(ventasDiaDesde, ventasDiaHasta, organizadorId, eventoFiltro).catch(() => []),
      this.reportesService.getVentasPorMes(organizadorId, eventoFiltro).catch(() => []),
      this.reportesService.getAsistenciaPorEvento(organizadorId, eventoFiltro).catch(() => []),
      this.reportesService.getIngresosPorEvento(organizadorId, eventoFiltro).catch(() => []),
      this.reportesService.getDistribucionMetodoPago(organizadorId, eventoFiltro).catch(() => []),
      this.reportesService.getDistribucionTipoBoleta(organizadorId, eventoFiltro).catch(() => []),
    ]);

    return {
      ventasPorDia,
      ventasPorMes,
      asistenciaPorEvento,
      ingresosPorEvento,
      distribucionMetodoPago,
      distribucionTipoBoleta,
    };
  }

  async cargarOrganizadores(): Promise<void> {
    if (!this.esAdministrador) return;
    this.loadingOrganizadores = true;
    try {
      this.organizadores = (await this.usuariosService.getOrganizadores()) || [];
    } catch {
      this.organizadores = [];
    } finally {
      this.loadingOrganizadores = false;
      this.cdr.detectChanges();
    }
  }

  async loadEventos(options?: { background?: boolean }): Promise<void> {
    const background = options?.background ?? this.eventos.length > 0;
    if (!background) {
      this.loadingEventos = true;
    }
    try {
      const filters: Record<string, unknown> = {
        limit: 500,
        page: 1,
        sortBy: 'fecha_inicio',
        sortOrder: 'desc',
      };
      const orgId = this.organizadorConsultaId;
      if (orgId) {
        filters['organizador_id'] = orgId;
      }
      const response = await this.eventosService.getEventos(filters as any);
      this.eventos = response.data || [];
      if (orgId) {
        this.eventos = this.eventos.filter((e) => e.organizador_id === orgId);
      }
    } catch {
      this.eventos = [];
    } finally {
      this.loadingEventos = false;
      this.persistState();
      this.cdr.detectChanges();
    }
  }

  private async loadComisionesReporte(): Promise<void> {
    try {
      const filtersBase: Record<string, unknown> = {
        limit: 10000,
        estado_pago: 'completado',
      };
      if (this.eventoFiltro) {
        filtersBase['evento_id'] = this.eventoFiltro;
      }

      const orgId = this.organizadorConsultaId;
      let eventosIds: number[] = [];
      if (orgId && !this.eventoFiltro) {
        eventosIds = this.eventos.map((e) => e.id);
        if (!eventosIds.length) {
          this.reporteComisiones = {
            totalBruto: 0,
            totalComision: 0,
            totalIVA: 0,
            totalNeto: 0,
            porEvento: [],
          };
          return;
        }
      }

      const response = await this.comprasService.getCompras(filtersBase as any);
      let compras = response.data || [];
      if (eventosIds.length) {
        compras = compras.filter((c: Compra) => eventosIds.includes(c.evento_id));
      }

      type EventoComisionesAcum = {
        eventoId: number;
        eventoTitulo: string;
        transacciones: number;
        brutoAcum: number;
        wompiAcum: number;
      };

      const porEventoMap: Record<number, EventoComisionesAcum> = {};
      let brutoAcum = 0;
      let wompiAcum = 0;

      compras.forEach((c: Compra) => {
        const bruto = Number(c.total || 0);
        const valorServicio = Number(c.valor_servicio || 0);
        const reparto = repartoWompiPorCompra(bruto, valorServicio);

        brutoAcum += bruto;
        wompiAcum += reparto.wompi_total;

        const eventoId = c.evento_id;
        if (!porEventoMap[eventoId]) {
          const eventoInfo = this.eventos.find((e) => e.id === eventoId);
          porEventoMap[eventoId] = {
            eventoId,
            eventoTitulo: eventoInfo?.titulo || 'Evento',
            transacciones: 0,
            brutoAcum: 0,
            wompiAcum: 0,
          };
        }
        porEventoMap[eventoId].transacciones += 1;
        porEventoMap[eventoId].brutoAcum += bruto;
        porEventoMap[eventoId].wompiAcum += reparto.wompi_total;
      });

      const porEvento = Object.values(porEventoMap)
        .map((ev) => this.finalizarFilaComisionesEvento(ev))
        .sort((a, b) => b.bruto - a.bruto);

      const totales = this.finalizarTotalesComisiones(brutoAcum, wompiAcum);

      this.reporteComisiones = {
        totalBruto: totales.bruto,
        totalComision: totales.comision,
        totalIVA: totales.iva,
        totalNeto: totales.neto,
        porEvento,
      };
    } catch (err) {
      console.error('[Reportes] Error comisiones:', err);
      this.reporteComisiones = null;
    } finally {
      this.persistState();
    }
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }

  getEstadoBoletaLabel(estado: string): string {
    const estados: Record<string, string> = {
      pendiente: 'Pendiente',
      usada: 'Usada',
      cancelada: 'Cancelada',
      reembolsada: 'Reembolsada',
    };
    return estados[estado] || estado;
  }

  getAsistenciaPaginated(): ReporteAsistencia[] {
    const start = (this.asistenciaPage - 1) * this.asistenciaLimit;
    return this.asistenciaPorEvento.slice(start, start + this.asistenciaLimit);
  }

  getAsistenciaTotalPages(): number {
    return Math.ceil(this.asistenciaTotal / this.asistenciaLimit);
  }

  getAsistenciaPageNumbers(): number[] {
    return this.pageNumbers(this.asistenciaPage, this.getAsistenciaTotalPages());
  }

  goToAsistenciaPage(pageNum: number): void {
    if (pageNum >= 1 && pageNum <= this.getAsistenciaTotalPages()) {
      this.asistenciaPage = pageNum;
    }
  }

  getIngresosPaginated() {
    const start = (this.ingresosPage - 1) * this.ingresosLimit;
    return this.ingresosPorEvento.slice(start, start + this.ingresosLimit);
  }

  getIngresosTotalPages(): number {
    return Math.ceil(this.ingresosTotal / this.ingresosLimit);
  }

  getIngresosPageNumbers(): number[] {
    return this.pageNumbers(this.ingresosPage, this.getIngresosTotalPages());
  }

  goToIngresosPage(pageNum: number): void {
    if (pageNum >= 1 && pageNum <= this.getIngresosTotalPages()) {
      this.ingresosPage = pageNum;
    }
  }

  private pageNumbers(current: number, totalPages: number): number[] {
    const pages: number[] = [];
    const maxPages = 5;
    if (totalPages <= maxPages) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }
    let start = Math.max(1, current - 2);
    let end = Math.min(totalPages, start + maxPages - 1);
    if (end - start < maxPages - 1) start = Math.max(1, end - maxPages + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  private rangoVentasPorDia(): { desde?: string; hasta?: string } {
    if (this.fechaDesde || this.fechaHasta) {
      return { desde: this.fechaDesde || undefined, hasta: this.fechaHasta || undefined };
    }
    const hasta = new Date();
    const desde = new Date();
    desde.setDate(desde.getDate() - 6);
    return { desde: this.toIsoDateLocal(desde), hasta: this.toIsoDateLocal(hasta) };
  }

  private toIsoDateLocal(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private formatFiltroFecha(iso: string): string {
    if (!iso) return '';
    const fecha = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(fecha.getTime())) return iso;
    return fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  }

  async exportarReporte(): Promise<void> {
    try {
      void this.alertService.snackbar('Preparando exportación…', { timerMs: 2200 });

      const eventoId = this.eventoFiltro || undefined;
      const orgId = this.organizadorConsultaId;
      this.stats =
        orgId != null
          ? await this.dashboardOrganizadorService.getStats(orgId, eventoId)
          : await this.dashboardService.getStats(eventoId);

      const reportes = await this.loadReportesInternal();
      this.ventasPorDia = reportes.ventasPorDia;
      this.ventasPorMes = reportes.ventasPorMes;
      this.asistenciaPorEvento = reportes.asistenciaPorEvento;
      this.ingresosPorEvento = reportes.ingresosPorEvento;
      this.distribucionMetodoPago = reportes.distribucionMetodoPago;
      this.distribucionTipoBoleta = reportes.distribucionTipoBoleta;
      await this.loadComisionesReporte();

      const sheets = this.buildExcelSheets();
      const fecha = new Date().toISOString().split('T')[0];
      await this.excelExportService.exportMultipleSheets(sheets, `reporte_eventum_${fecha}`);
      void this.alertService.success('Exportado', `Excel con ${sheets.length} hojas descargado.`);
    } catch (err) {
      console.error('[Reportes] Export error:', err);
      void this.alertService.error('Error', 'No se pudo exportar el reporte.');
    }
  }

  private buildExcelSheets(): { name: string; data: Record<string, unknown>[] }[] {
    const sheets: { name: string; data: Record<string, unknown>[] }[] = [];
    const s = this.stats;
    const asistenciaTotales = this.totalesAsistenciaExport();
    const ticketPromedio = this.ticketPromedioExport();

    sheets.push({
      name: 'Contexto',
      data: [
        { Campo: 'Fecha exportación', Valor: new Date().toLocaleString('es-CO') },
        { Campo: 'Organizador', Valor: this.etiquetaOrganizadorExport() },
        { Campo: 'Evento', Valor: this.etiquetaEventoExport() },
        {
          Campo: 'Rango fechas (filtro)',
          Valor:
            this.fechaDesde || this.fechaHasta
              ? `${this.fechaDesde || '—'} → ${this.fechaHasta || '—'}`
              : 'Sin filtro de fechas',
        },
      ],
    });

    const resumenRows: Record<string, unknown>[] = [
      { Sección: 'GENERAL', Métrica: '', Valor: '' },
      { Sección: '', Métrica: 'Boletas vendidas', Valor: s.boletas_vendidas || asistenciaTotales.vendidas },
      { Sección: '', Métrica: 'Boletas usadas', Valor: s.boletas_usadas ?? asistenciaTotales.usadas },
      { Sección: '', Métrica: 'Boletas pendientes', Valor: s.boletas_pendientes ?? asistenciaTotales.pendientes },
      {
        Sección: '',
        Métrica: 'Tasa asistencia global (%)',
        Valor: s.tasa_asistencia ?? asistenciaTotales.tasa,
      },
      { Sección: '', Métrica: 'Clientes únicos', Valor: s.clientes },
      { Sección: '', Métrica: 'Eventos totales', Valor: s.eventos_totales ?? '—' },
      { Sección: '', Métrica: 'Eventos activos', Valor: s.eventos_activos },
      { Sección: '', Métrica: 'Ticket promedio (COP)', Valor: ticketPromedio ?? '—' },
      { Sección: 'INGRESOS', Métrica: '', Valor: '' },
      { Sección: '', Métrica: 'Ingresos totales (COP)', Valor: s.ingresos_totales },
      { Sección: '', Métrica: 'Ingresos ventas bruto (COP)', Valor: s.ingresos_ventas_bruto_total ?? '—' },
      { Sección: '', Métrica: 'Ingresos productos (COP)', Valor: s.ingresos_productos_totales ?? '—' },
      { Sección: '', Métrica: 'Ingresos hoy (COP)', Valor: s.ingresos_dia_actual ?? '—' },
      { Sección: 'SERVICIO EVENTUM', Métrica: '', Valor: '' },
      { Sección: '', Métrica: 'Valor servicio total (COP)', Valor: s.valor_servicio_total ?? '—' },
      { Sección: '', Métrica: '% servicio promedio', Valor: s.porcentaje_servicio_promedio ?? '—' },
    ];

    if (s.tiene_productos) {
      resumenRows.push(
        { Sección: 'PRODUCTOS', Métrica: '', Valor: '' },
        { Sección: '', Métrica: 'Unidades vendidas', Valor: s.productos_vendidos ?? '—' },
        { Sección: '', Métrica: 'Pedidos productos', Valor: s.pedidos_productos ?? '—' },
        { Sección: '', Métrica: 'Ingresos productos bruto (COP)', Valor: s.ingresos_productos_bruto_total ?? '—' }
      );
    }

    resumenRows.push(
      { Sección: 'NOTA', Métrica: 'Comisiones Wompi', Valor: 'Ver hoja «Comisiones Wompi» y «Comisiones por evento»' }
    );

    sheets.push({ name: 'Resumen', data: resumenRows });

    sheets.push({
      name: 'Ingresos evento',
      data: this.ingresosPorEvento.length
        ? this.ingresosPorEvento.map((item) => ({
            Evento: item.evento_titulo,
            'Boletas (#)': item.boletas_vendidas,
            'Ingresos (COP)': item.ingresos,
            'Ticket prom (COP)':
              item.boletas_vendidas > 0
                ? Math.round(item.ingresos / item.boletas_vendidas)
                : 0,
          }))
        : [{ Evento: 'Sin datos', 'Boletas (#)': 0, 'Ingresos (COP)': 0, 'Ticket prom (COP)': 0 }],
    });

    sheets.push({
      name: 'Asistencia',
      data: this.asistenciaPorEvento.length
        ? this.asistenciaPorEvento.map((a) => ({
            Evento: a.evento_titulo,
            'Vendidas (#)': a.boletas_vendidas,
            'Usadas (#)': a.boletas_usadas,
            'Pendientes (#)': a.boletas_pendientes,
            'Tasa (%)': a.tasa_asistencia,
          }))
        : [{ Evento: 'Sin datos', 'Vendidas (#)': 0, 'Usadas (#)': 0, 'Pendientes (#)': 0, 'Tasa (%)': 0 }],
    });

    sheets.push({
      name: 'Distribuciones',
      data: this.buildDistribucionesExcelSheet(s),
    });

    sheets.push({
      name: 'Comisiones Wompi',
      data: this.buildComisionesWompiExcelSheet(s),
    });

    if (this.reporteComisiones) {
      const rc = this.reporteComisiones;
      sheets.push({
        name: 'Comisiones por evento',
        data: rc.porEvento.length
          ? rc.porEvento.map((ev) => ({
              Evento: ev.eventoTitulo,
              'Trans. (#)': ev.transacciones,
              'Bruto (COP)': this.copExcel(ev.bruto),
              'Comisión (COP)': this.copExcel(ev.comision),
              'IVA (COP)': this.copExcel(ev.iva),
              'Neto (COP)': this.copExcel(ev.neto),
            }))
          : [
              {
                Evento: 'Sin datos',
                'Trans. (#)': 0,
                'Bruto (COP)': 0,
                'Comisión (COP)': 0,
                'IVA (COP)': 0,
                'Neto (COP)': 0,
              },
            ],
      });
    }

    return sheets;
  }

  private totalesAsistenciaExport(): {
    vendidas: number;
    usadas: number;
    pendientes: number;
    tasa: number;
  } {
    let vendidas = 0;
    let usadas = 0;
    let pendientes = 0;
    for (const row of this.asistenciaPorEvento) {
      vendidas += row.boletas_vendidas;
      usadas += row.boletas_usadas;
      pendientes += row.boletas_pendientes;
    }
    return {
      vendidas,
      usadas,
      pendientes,
      tasa: vendidas > 0 ? Math.round((usadas / vendidas) * 100) : 0,
    };
  }

  private ticketPromedioExport(): number | null {
    const s = this.stats;
    if (s.promedio_ticket != null && s.promedio_ticket > 0) {
      return Math.round(s.promedio_ticket);
    }
    const ingresos = this.ingresosPorEvento.reduce((sum, item) => sum + item.ingresos, 0);
    const boletas = this.ingresosPorEvento.reduce((sum, item) => sum + item.boletas_vendidas, 0);
    if (boletas > 0) {
      return Math.round(ingresos / boletas);
    }
    if (s.boletas_vendidas > 0 && s.ingresos_totales > 0) {
      return Math.round(s.ingresos_totales / s.boletas_vendidas);
    }
    return null;
  }

  private finalizarTotalesComisiones(
    brutoAcum: number,
    wompiAcum: number
  ): { bruto: number; comision: number; iva: number; neto: number; wompi: number } {
    const bruto = Math.round(brutoAcum);
    const wompi = Math.round(wompiAcum);
    const split = this.splitWompiBaseIva(wompi);
    return {
      bruto,
      wompi,
      comision: split.base,
      iva: split.iva,
      neto: Math.round(brutoAcum - wompiAcum),
    };
  }

  private finalizarFilaComisionesEvento(ev: {
    eventoId: number;
    eventoTitulo: string;
    transacciones: number;
    brutoAcum: number;
    wompiAcum: number;
  }): {
    eventoId: number;
    eventoTitulo: string;
    transacciones: number;
    bruto: number;
    comision: number;
    iva: number;
    neto: number;
  } {
    const totales = this.finalizarTotalesComisiones(ev.brutoAcum, ev.wompiAcum);
    return {
      eventoId: ev.eventoId,
      eventoTitulo: ev.eventoTitulo,
      transacciones: ev.transacciones,
      bruto: totales.bruto,
      comision: totales.comision,
      iva: totales.iva,
      neto: totales.neto,
    };
  }

  private splitWompiBaseIva(wompiTotal: number): { base: number; iva: number } {
    const wompi = Math.round(Number(wompiTotal || 0));
    if (wompi <= 0) {
      return { base: 0, iva: 0 };
    }
    const base = Math.round(wompi / (1 + WOMPI_IVA));
    return { base, iva: wompi - base };
  }

  private buildComisionesWompiExcelSheet(s: DashboardStats): Record<string, unknown>[] {
    const wompiBoletas = this.copExcel(s.wompi_ventas_total ?? 0);
    const wompiServicio = this.copExcel(s.wompi_servicio_total ?? 0);
    const splitBoletas = this.splitWompiBaseIva(wompiBoletas);
    const splitServicio = this.splitWompiBaseIva(wompiServicio);
    const wompiTotal = wompiBoletas + wompiServicio;
    const netoBoletas = this.copExcel(s.neto_ventas_post_wompi_total ?? 0);
    const netoServicio = this.copExcel(s.neto_servicio_post_wompi_total ?? 0);
    const blank = { Sección: '', Métrica: '', 'Valor (COP)': '' };

    return [
      { Sección: 'VALOR CLIENTE (EMPRESARIO)', Métrica: '', 'Valor (COP)': '' },
      { Sección: '', Métrica: 'Bruto boletas', 'Valor (COP)': this.copExcel(s.ingresos_ventas_bruto_total ?? 0) },
      { Sección: '', Métrica: 'Comisión Wompi (base, sin IVA)', 'Valor (COP)': splitBoletas.base },
      { Sección: '', Métrica: 'IVA Wompi (19%)', 'Valor (COP)': splitBoletas.iva },
      { Sección: '', Métrica: 'Wompi boletas (comisión + IVA)', 'Valor (COP)': wompiBoletas },
      { Sección: '', Métrica: 'Neto boletas', 'Valor (COP)': netoBoletas },
      blank,
      { Sección: 'VALOR SERVICIO (EVENTUM)', Métrica: '', 'Valor (COP)': '' },
      { Sección: '', Métrica: 'Servicio bruto boletas', 'Valor (COP)': this.copExcel(s.valor_servicio_total ?? 0) },
      { Sección: '', Métrica: 'Comisión Wompi (base, sin IVA)', 'Valor (COP)': splitServicio.base },
      { Sección: '', Métrica: 'IVA Wompi (19%)', 'Valor (COP)': splitServicio.iva },
      { Sección: '', Métrica: 'Wompi servicio boletas (comisión + IVA)', 'Valor (COP)': wompiServicio },
      { Sección: '', Métrica: 'Neto servicio boletas', 'Valor (COP)': netoServicio },
      blank,
      { Sección: 'TOTALES', Métrica: '', 'Valor (COP)': '' },
      { Sección: '', Métrica: 'Ingresos totales', 'Valor (COP)': this.copExcel(s.ingresos_totales ?? 0) },
      {
        Sección: '',
        Métrica: 'Comisión Wompi total (base, sin IVA)',
        'Valor (COP)': splitBoletas.base + splitServicio.base,
      },
      { Sección: '', Métrica: 'IVA Wompi total (19%)', 'Valor (COP)': splitBoletas.iva + splitServicio.iva },
      { Sección: '', Métrica: 'Wompi total (comisión + IVA)', 'Valor (COP)': wompiTotal },
      {
        Sección: '',
        Métrica: 'Neto total',
        'Valor (COP)': this.copExcel(s.neto_total_post_wompi_total ?? netoBoletas + netoServicio),
      },
    ];
  }

  get comisionesWompiDesglose(): {
    cliente: { bruto: number; comisionBase: number; iva: number; wompi: number; neto: number };
    servicio: { bruto: number; comisionBase: number; iva: number; wompi: number; neto: number };
    totales: { ingresos: number; comisionBase: number; iva: number; wompi: number; neto: number };
  } | null {
    const s = this.stats;
    if (!s.ingresos_totales) {
      return null;
    }
    const splitBoletas = this.splitWompiBaseIva(s.wompi_ventas_total ?? 0);
    const splitServicio = this.splitWompiBaseIva(s.wompi_servicio_total ?? 0);
    const wompiBoletas = this.copExcel(s.wompi_ventas_total ?? 0);
    const wompiServicio = this.copExcel(s.wompi_servicio_total ?? 0);
    return {
      cliente: {
        bruto: this.copExcel(s.ingresos_ventas_bruto_total ?? 0),
        comisionBase: splitBoletas.base,
        iva: splitBoletas.iva,
        wompi: wompiBoletas,
        neto: this.copExcel(s.neto_ventas_post_wompi_total ?? 0),
      },
      servicio: {
        bruto: this.copExcel(s.valor_servicio_total ?? 0),
        comisionBase: splitServicio.base,
        iva: splitServicio.iva,
        wompi: wompiServicio,
        neto: this.copExcel(s.neto_servicio_post_wompi_total ?? 0),
      },
      totales: {
        ingresos: this.copExcel(s.ingresos_totales ?? 0),
        comisionBase: splitBoletas.base + splitServicio.base,
        iva: splitBoletas.iva + splitServicio.iva,
        wompi: wompiBoletas + wompiServicio,
        neto: this.copExcel(s.neto_total_post_wompi_total ?? 0),
      },
    };
  }

  private buildDistribucionesExcelSheet(s: DashboardStats): Record<string, unknown>[] {
    const rows: Record<string, unknown>[] = [];
    const blank = { Sección: '', Detalle: '', 'Cantidad (#)': '', '%': '' };

    rows.push({ Sección: 'BOLETAS POR ESTADO', Detalle: '', 'Cantidad (#)': '', '%': '' });
    const estados = s.boletas_por_estado || [];
    if (estados.length) {
      for (const item of estados) {
        rows.push({
          Sección: '',
          Detalle: this.getEstadoBoletaLabel(item.estado),
          'Cantidad (#)': item.cantidad,
          '%':
            s.boletas_vendidas > 0 ? Math.round((item.cantidad / s.boletas_vendidas) * 100) : 0,
        });
      }
    } else {
      rows.push({ Sección: '', Detalle: 'Sin datos', 'Cantidad (#)': 0, '%': 0 });
    }

    rows.push(blank);
    rows.push({ Sección: 'TOP EVENTOS', Detalle: '', 'Cantidad (#)': '', '%': '' });
    const topEventos = s.top_eventos || [];
    if (topEventos.length) {
      topEventos.forEach((ev: { titulo?: string; boletas_vendidas?: number }, i: number) => {
        rows.push({
          Sección: '',
          Detalle: `#${i + 1} ${ev.titulo || 'Evento'}`,
          'Cantidad (#)': ev.boletas_vendidas || 0,
          '%': '',
        });
      });
    } else {
      rows.push({ Sección: '', Detalle: 'Sin datos', 'Cantidad (#)': 0, '%': '' });
    }

    rows.push(blank);
    rows.push({ Sección: 'MÉTODO DE PAGO', Detalle: '', 'Cantidad (#)': '', '%': '' });
    if (this.distribucionMetodoPago.length) {
      for (const item of this.distribucionMetodoPago) {
        rows.push({
          Sección: '',
          Detalle: item.metodo,
          'Cantidad (#)': item.cantidad,
          '%': item.porcentaje,
        });
      }
    } else {
      rows.push({ Sección: '', Detalle: 'Sin datos', 'Cantidad (#)': 0, '%': 0 });
    }

    rows.push(blank);
    rows.push({ Sección: 'TIPO DE BOLETA', Detalle: '', 'Cantidad (#)': '', '%': '' });
    if (this.distribucionTipoBoleta.length) {
      for (const item of this.distribucionTipoBoleta) {
        rows.push({
          Sección: '',
          Detalle: item.tipo,
          'Cantidad (#)': item.cantidad,
          '%': item.porcentaje,
        });
      }
    } else {
      rows.push({ Sección: '', Detalle: 'Sin datos', 'Cantidad (#)': 0, '%': 0 });
    }

    return rows;
  }

  private copExcel(value: number): number {
    return Math.round(Number(value || 0));
  }

  private get cacheKey(): string | null {
    if (!this.currentCacheUserId) return null;
    return `eventum:cache:v1:reportes:user:${this.currentCacheUserId}`;
  }

  private getCachedState(): Record<string, unknown> | null {
    const key = this.cacheKey;
    if (!key) return null;
    const cached = this.appCacheService.get<Record<string, unknown>>(key, 'session');
    if (!cached) return null;
    if (Date.now() - Number(cached['lastUpdated'] || 0) > this.cacheTtlMs) return null;
    return cached;
  }

  private applyCachedState(state: Record<string, unknown>): void {
    this.stats = (state['stats'] as DashboardStats) || this.stats;
    this.eventos = (state['eventos'] as Evento[]) || [];
    this.ventasPorDia = (state['ventasPorDia'] as ReporteVentas[]) || [];
    this.ventasPorMes = (state['ventasPorMes'] as { mes: string; ventas: number; ingresos: number }[]) || [];
    this.asistenciaPorEvento = (state['asistenciaPorEvento'] as ReporteAsistencia[]) || [];
    this.asistenciaTotal = Number(state['asistenciaTotal'] ?? this.asistenciaPorEvento.length);
    this.asistenciaPage = Number(state['asistenciaPage'] ?? 1);
    this.ingresosPorEvento =
      (state['ingresosPorEvento'] as { evento_id: number; evento_titulo: string; ingresos: number; boletas_vendidas: number }[]) || [];
    this.ingresosTotal = Number(state['ingresosTotal'] ?? this.ingresosPorEvento.length);
    this.ingresosPage = Number(state['ingresosPage'] ?? 1);
    this.distribucionMetodoPago =
      (state['distribucionMetodoPago'] as { metodo: string; cantidad: number; porcentaje: number }[]) || [];
    this.distribucionTipoBoleta =
      (state['distribucionTipoBoleta'] as { tipo: string; cantidad: number; porcentaje: number }[]) || [];
    this.reporteComisiones = (state['reporteComisiones'] as typeof this.reporteComisiones) ?? null;
    this.tabActivo = (state['tabActivo'] as typeof this.tabActivo) || 'general';
    this.eventoFiltro = (state['eventoFiltro'] as number | null) ?? null;
    this.fechaDesde = (state['fechaDesde'] as string) || '';
    this.fechaHasta = (state['fechaHasta'] as string) || '';
    this.organizadorFiltroAdmin = (state['organizadorFiltroAdmin'] as number | null) ?? null;
    this.esAdministrador = Boolean(state['esAdministrador'] ?? this.esAdministrador);
    this.esOrganizador = Boolean(state['esOrganizador'] ?? this.esOrganizador);
    this.organizadorId = (state['organizadorId'] as number | null) ?? this.organizadorId;
    this.filtrosExpandidos = Boolean(state['filtrosExpandidos'] ?? false);
  }

  private persistState(): void {
    const key = this.cacheKey;
    if (!key) return;
    this.appCacheService.set(
      key,
      {
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
        reporteComisiones: this.reporteComisiones,
        tabActivo: this.tabActivo,
        eventoFiltro: this.eventoFiltro,
        fechaDesde: this.fechaDesde,
        fechaHasta: this.fechaHasta,
        organizadorFiltroAdmin: this.organizadorFiltroAdmin,
        esAdministrador: this.esAdministrador,
        esOrganizador: this.esOrganizador,
        organizadorId: this.organizadorId,
        filtrosExpandidos: this.filtrosExpandidos,
        lastUpdated: Date.now(),
      },
      'session'
    );
  }

  private etiquetaOrganizadorExport(): string {
    if (this.esOrganizador && this.organizadorId) {
      const u = this.authService.getUsuario();
      return u ? `${u.nombre || ''} ${u.apellido || ''}`.trim() || u.email || 'Organizador' : 'Organizador';
    }
    if (!this.organizadorFiltroAdmin) {
      return 'Todos';
    }
    const org = this.organizadores.find((o) => o.id === this.organizadorFiltroAdmin);
    return org ? `${org.nombre} ${org.apellido || ''}`.trim() : `ID ${this.organizadorFiltroAdmin}`;
  }

  private etiquetaEventoExport(): string {
    if (!this.eventoFiltro) {
      return 'Todos';
    }
    const ev = this.eventos.find((e) => e.id === this.eventoFiltro);
    return ev?.titulo || `Evento #${this.eventoFiltro}`;
  }

  private emptyStats(): DashboardStats {
    return {
      eventos_activos: 0,
      boletas_vendidas: 0,
      productos_vendidos: 0,
      pedidos_productos: 0,
      tiene_productos: false,
      ingresos_totales: 0,
      ingresos_productos_totales: 0,
      clientes: 0,
      eventos_totales: 0,
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
      top_eventos: [],
    };
  }
}
