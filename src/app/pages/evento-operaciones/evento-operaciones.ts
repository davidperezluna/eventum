import { Component, OnInit, ChangeDetectorRef } from '@angular/core';

import { CommonModule } from '@angular/common';

import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { EventosService } from '../../services/eventos.service';

import { BoletasService } from '../../services/boletas.service';

import { ProductosService } from '../../services/productos.service';

import { CuponesService } from '../../services/cupones.service';

import { DashboardService } from '../../services/dashboard.service';

import { DashboardOrganizadorService } from '../../services/dashboard-organizador.service';

import { ReportesService, ReporteEvento } from '../../services/reportes.service';

import { DemoDataProvider } from '../../demo/demo-data.provider';

import { AuthService } from '../../services/auth.service';

import { AlertService } from '../../services/alert.service';

import { DrawerService } from '../../core/drawer';

import { openEventoCuponesDrawer } from '../../panels/evento-cupones';
import { openEventoPalcosDrawer } from '../../panels/evento-palcos';
import { openEventoImagenDrawer } from '../../panels/evento-imagen';
import { openEventoCobrosDrawer } from '../../panels/evento-cobros';
import { openEventoBoletasDrawer } from '../../panels/evento-boletas';
import { openEventoProductosDrawer } from '../../panels/evento-productos';
import { openEventoFechasDrawer } from '../../panels/evento-fechas';
import { openEventoInformacionDrawer } from '../../panels/evento-informacion';

import { Evento, TipoBoleta, TipoEstadoEvento, DashboardStats, CuponDescuento } from '../../types';

import { DateFormatPipe } from '../../pipes/date-format.pipe';

import {
  buildEventoReadiness,
  EventoReadinessResult,
  EventoReadinessStep,
  getPrePublishPendingSteps,
  formatPrePublishPendingMessage,
  isEventoReadyToPublish,
} from '../../core/evento-readiness';

import {
  isEventoCatalogoInconsistent,
  patchBorrador,
  patchFinalizado,
  patchFueraDeCatalogo,
  patchPublicadoEnCatalogo,
} from '../../core/evento-publicacion';

import { resolveEventoEstadoVisual } from '../../core/evento-en-curso';

import {
  canOrganizadorOpenOperaciones,
  organizadorOperacionesBlockedMessage,
} from '../../core/evento-operaciones-access';

import { formatFinanzasMonedaExacta, getRecaudoBrutoConsolidado, resolveMostrarProductos } from '../../utils/dashboard-finanzas.view';

import {
  buildEventoTimeline,

  EventoTimelineItem,

  formatTimelineDate,

} from '../../core/evento-timeline';



interface LifecycleStep {

  value: TipoEstadoEvento;

  label: string;

  /** false = solo informativo (p. ej. En curso por fechas). */
  clickable?: boolean;

}



export interface OpsAction {

  id: string;

  label: string;

  icon: string;

  badge?: string | null;

  disabled?: boolean;

  dock?: boolean;

}



@Component({

  selector: 'app-evento-operaciones',

  standalone: true,

  imports: [CommonModule, RouterLink, DateFormatPipe],

  templateUrl: './evento-operaciones.html',

  styleUrls: ['./evento-operaciones.css', '../eventos/eventos.css'],

})

export class EventoOperaciones implements OnInit {

  evento: Evento | null = null;

  tiposBoleta: TipoBoleta[] = [];

  cupones: CuponDescuento[] = [];

  tieneProductos = false;

  productosCount = 0;

  stats: DashboardStats | null = null;

  reporte: ReporteEvento | null = null;

  timeline: EventoTimelineItem[] = [];

  readiness: EventoReadinessResult | null = null;

  loading = true;

  savingEstado = false;

  savingLiquidado = false;

  publishing = false;

  showMoreSheet = false;

  eventoId = 0;

  /** Evita caché del navegador en la imagen del hero tras guardar en el drawer. */
  heroImagenVersion = 0;



  readonly lifecycleSteps: LifecycleStep[] = [

    { value: TipoEstadoEvento.BORRADOR, label: 'Borrador' },

    { value: TipoEstadoEvento.PUBLICADO, label: 'Publicado' },

    { value: TipoEstadoEvento.EN_CURSO, label: 'En curso', clickable: false },

    { value: TipoEstadoEvento.FINALIZADO, label: 'Finalizado' },

  ];



  constructor(

    private route: ActivatedRoute,

    private router: Router,

    public authService: AuthService,

    private eventosService: EventosService,

    private boletasService: BoletasService,

    private productosService: ProductosService,

    private cuponesService: CuponesService,

    private dashboardService: DashboardService,

    private dashboardOrganizadorService: DashboardOrganizadorService,

    private reportesService: ReportesService,

    private demoDataProvider: DemoDataProvider,

    private alertService: AlertService,

    private drawerService: DrawerService,

    private cdr: ChangeDetectorRef,

  ) {}



  get isShowcaseMode(): boolean {

    return this.authService.isShowcaseOrganizador();

  }



  get ventasBlocked(): boolean {

    return this.isShowcaseMode;

  }



  ngOnInit(): void {

    this.route.paramMap.subscribe((params) => {

      const id = Number(params.get('id'));

      if (!id || id <= 0) {

        void this.router.navigate(['/eventos']);

        return;

      }

      this.eventoId = id;

      void this.loadPage();

    });

  }



  async loadPage(): Promise<void> {

    this.loading = true;

    this.cdr.detectChanges();

    try {

      const evento = await this.eventosService.getEventoById(this.eventoId);

      if (!this.canAccessEvento(evento)) {

        this.alertService.warning('Acceso denegado', 'No tienes permiso para administrar este evento.');

        void this.router.navigate(['/eventos']);

        return;

      }

      if (!canOrganizadorOpenOperaciones(evento, this.authService.isOrganizador())) {
        const blocked = organizadorOperacionesBlockedMessage(evento);
        this.alertService.warning(blocked.title, blocked.message);
        void this.router.navigate(['/eventos', this.eventoId, 'inteligencia']);
        return;
      }

      this.evento = await this.demoDataProvider.applyEventoPresentation(evento);

      if (isEventoCatalogoInconsistent(evento) && !this.isShowcaseMode) {
        const synced = await this.eventosService.updateEvento(evento.id, patchPublicadoEnCatalogo());
        this.evento = { ...evento, ...synced, lugar: evento.lugar };
      }



      const orgId = this.authService.isOrganizador() ? this.authService.getUsuarioId() : null;



      const [tipos, tieneProductos, cupones, resumenMap, stats, reporte] = await Promise.all([

        this.boletasService
          .getTiposBoleta(this.eventoId, { includeInactive: true })
          .catch(() => [] as TipoBoleta[]),

        this.productosService.eventoTieneProductos(this.eventoId).catch(() => false),

        this.cuponesService.getCuponesByEvento(this.eventoId).catch(() => [] as CuponDescuento[]),

        this.productosService.getResumenProductosPorEvento([this.eventoId]).catch(() => new Map()),

        orgId != null

          ? this.demoDataProvider.getEventDashboardStats(orgId, this.eventoId).catch(() => null)

          : this.demoDataProvider.getEventDashboardStats(null, this.eventoId).catch(() => null),

        this.demoDataProvider.getReporteEvento(orgId, this.eventoId).catch(() => null),

      ]);



      this.tiposBoleta = await this.demoDataProvider.applyTiposBoleta(tipos, this.eventoId);

      this.tieneProductos = tieneProductos;

      this.cupones = await this.demoDataProvider.applyCupones(cupones, this.eventoId);

      this.productosCount = resumenMap.get(this.eventoId)?.cantidad ?? 0;

      this.stats = stats;

      this.reporte = reporte;

      this.rebuildReadiness();

      this.rebuildTimeline();

      if (this.route.snapshot.queryParamMap.get('open') === 'boletas') {

        this.openBoletasDrawer();

        void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });

      } else if (this.route.snapshot.queryParamMap.get('open') === 'imagen') {

        this.openImagenDrawer();

        void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });

      } else if (this.route.snapshot.queryParamMap.get('open') === 'productos') {

        this.openProductosDrawer();

        void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });

      } else if (this.route.snapshot.queryParamMap.get('open') === 'fechas') {

        this.openFechasDrawer();

        void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });

      } else if (this.route.snapshot.queryParamMap.get('open') === 'informacion') {

        this.openInformacionDrawer();

        void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });

      }

    } catch (err) {

      console.error('Error cargando centro de operaciones:', err);

      this.alertService.error('Error', 'No se pudo cargar el evento.');

      void this.router.navigate(['/eventos']);

    } finally {

      this.loading = false;

      this.cdr.detectChanges();

    }

  }



  private canAccessEvento(evento: Evento): boolean {

    if (!this.authService.isOrganizador()) {

      return true;

    }

    const orgId = this.authService.getUsuarioId();

    return orgId != null && evento.organizador_id === orgId;

  }

  private puedeReservarPalcosOperaciones(): boolean {
    return (
      (this.authService.isOrganizador() || this.authService.isAdministrador())
      && !this.isShowcaseMode
      && this.tiposBoleta.some((tipo) => !!tipo.es_palco)
    );
  }



  private rebuildReadiness(): void {

    if (!this.evento) {

      this.readiness = null;

      return;

    }

    this.readiness = buildEventoReadiness(this.evento, this.tiposBoleta, this.tieneProductos);

  }



  private rebuildTimeline(): void {

    if (!this.evento) {

      this.timeline = [];

      return;

    }

    this.timeline = buildEventoTimeline(this.evento, this.reporte);

  }



  get opsActions(): OpsAction[] {

    const tiposCount = this.tiposBoleta.length;

    const cuponesCount = this.cupones.length;

    const hideScanner = this.authService.isOrganizador();



    return [

      {

        id: 'boletas',

        label: 'Boletas',

        icon: 'confirmation_number',

        badge: tiposCount > 0 ? `${tiposCount} tipo${tiposCount === 1 ? '' : 's'}` : null,

        dock: true,

      },

      {

        id: 'productos',

        label: 'Productos',

        icon: 'local_bar',

        badge: this.productosCount > 0 ? `${this.productosCount} producto${this.productosCount === 1 ? '' : 's'}` : null,

        dock: true,

      },

      ...(hideScanner
        ? []
        : [
            {
              id: 'escanear',
              label: 'Escanear',
              icon: 'qr_code_scanner',
              dock: true,
            } as OpsAction,
          ]),

      {

        id: 'ventas',

        label: 'Ventas',

        icon: 'receipt_long',

        badge: this.reporte && this.reporte.boletas_vendidas > 0

          ? `${this.reporte.boletas_vendidas} venta${this.reporte.boletas_vendidas === 1 ? '' : 's'}`

          : null,

        disabled: this.ventasBlocked,

      },

      ...(this.puedeReservarPalcosOperaciones()
        ? [{
            id: 'reservar-palcos',
            label: 'Reservar palcos',
            icon: 'table_restaurant',
            badge: 'Bloqueo manual',
          } as OpsAction]
        : []),

      {

        id: 'cupones',

        label: 'Cupones',

        icon: 'sell',

        badge: cuponesCount > 0 ? `${cuponesCount} cupón${cuponesCount === 1 ? '' : 'es'}` : null,

      },

      {

        id: 'mas',

        label: 'Más',

        icon: 'more_horiz',

        dock: true,

      },

    ];

  }



  get dockActions(): OpsAction[] {

    return this.opsActions.filter((a) => a.dock);

  }



  get barActions(): OpsAction[] {

    return this.opsActions.filter((a) => a.id !== 'mas');

  }



  get hasSales(): boolean {

    return (this.reporte?.boletas_vendidas ?? 0) > 0;

  }



  get cuponesUsados(): number {

    return this.cupones.reduce((sum, c) => sum + (c.usos_actuales ?? 0), 0);

  }



  get recaudoBrutoEvento(): number {
    if (!this.stats) return 0;
    return getRecaudoBrutoConsolidado(this.stats, resolveMostrarProductos(this.stats));
  }

  get ingresosTrend(): { label: string; positive: boolean } | null {

    if (!this.stats) return null;

    const hoy = this.stats.ingresos_dia_actual ?? 0;

    const ayer = this.stats.ingresos_dia_anterior ?? 0;

    if (hoy === 0 && ayer === 0) return null;

    if (ayer === 0) {

      return { label: 'Hoy con ventas', positive: true };

    }

    const pct = Math.round(((hoy - ayer) / ayer) * 100);

    if (pct === 0) return { label: 'Igual que ayer', positive: true };

    return {

      label: `${pct > 0 ? '+' : ''}${pct}% vs ayer`,

      positive: pct >= 0,

    };

  }



  get estadoActual(): TipoEstadoEvento {

    return (this.evento?.estado as TipoEstadoEvento) ?? TipoEstadoEvento.BORRADOR;

  }

  /** Estado mostrado en UI (En curso se deriva por fechas). */
  get estadoVisual(): TipoEstadoEvento {
    return resolveEventoEstadoVisual(this.evento);
  }

  get lifecycleIndex(): number {
    return this.lifecycleSteps.findIndex((s) => s.value === this.estadoVisual);
  }

  get estadoLabel(): string {
    if (this.estadoVisual === TipoEstadoEvento.CANCELADO) {
      return 'Cancelado';
    }
    return this.lifecycleSteps.find((s) => s.value === this.estadoVisual)?.label ?? 'Sin estado';
  }

  get isLiquidado(): boolean {
    return this.evento?.liquidado === true;
  }

  get canToggleLiquidado(): boolean {
    return this.authService.isAdministrador() && !this.isShowcaseMode;
  }



  get contextMessage(): string {

    switch (this.estadoVisual) {

      case TipoEstadoEvento.PUBLICADO:
        // El mensaje de “disponible / ventas” vive en la sección de readiness.
        return '';

      case TipoEstadoEvento.EN_CURSO:

        return 'El evento está en curso según las fechas (inicio ya pasó y aún no termina).';

      case TipoEstadoEvento.FINALIZADO:

        return 'Consulta estadísticas o duplica este evento.';

      case TipoEstadoEvento.CANCELADO:

        return 'Este evento fue cancelado.';

      default:

        return 'Tu evento todavía no es visible para el público.';

    }

  }

  get showContextBanner(): boolean {
    return !!this.contextMessage;
  }



  get contextBannerClass(): string {

    switch (this.estadoVisual) {

      case TipoEstadoEvento.PUBLICADO:

        return 'ev-ops-hero__context--published';

      case TipoEstadoEvento.EN_CURSO:

        return 'ev-ops-hero__context--live';

      case TipoEstadoEvento.FINALIZADO:

        return 'ev-ops-hero__context--done';

      case TipoEstadoEvento.CANCELADO:

        return 'ev-ops-hero__context--cancelled';

      default:

        return 'ev-ops-hero__context--draft';

    }

  }



  get canPublishEvento(): boolean {
    if (!this.readiness) return false;
    return isEventoReadyToPublish(this.readiness);
  }

  get isPublishBlocked(): boolean {
    return this.estadoActual === TipoEstadoEvento.BORRADOR && !this.canPublishEvento;
  }

  get showHeroPrimaryAction(): boolean {
    return this.estadoActual !== TipoEstadoEvento.BORRADOR;
  }

  get isPrimaryActionDisabled(): boolean {
    return this.publishing || this.savingEstado;
  }

  get primaryActionLabel(): string {

    switch (this.estadoVisual) {

      case TipoEstadoEvento.PUBLICADO:

        return this.evento?.activo ? 'Ocultar del catálogo' : 'Mostrar en catálogo';

      case TipoEstadoEvento.EN_CURSO:

        return this.evento?.activo ? 'Ocultar del catálogo' : 'Mostrar en catálogo';

      case TipoEstadoEvento.FINALIZADO:

      case TipoEstadoEvento.CANCELADO:

        return 'Ver inteligencia';

      default:

        return 'Publicar evento';

    }

  }



  get lugarLabel(): string {

    const lugar = this.evento?.lugar;

    if (!lugar?.nombre) return 'Sin lugar asignado';

    return lugar.ciudad ? `${lugar.nombre}, ${lugar.ciudad}` : lugar.nombre;

  }



  get iniciales(): string {

    const titulo = this.evento?.titulo?.trim() ?? '';

    const words = titulo.split(/\s+/).filter(Boolean);

    if (words.length === 0) return 'EV';

    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

    return `${words[0][0]}${words[1][0]}`.toUpperCase();

  }



  formatCurrency(value: number | undefined | null): string {
    return formatFinanzasMonedaExacta(value);
  }



  formatTimelineItemDate(item: EventoTimelineItem): string | null {

    return formatTimelineDate(item.date);

  }



  isLifecycleStepActive(step: LifecycleStep): boolean {

    return step.value === this.estadoVisual;

  }



  isLifecycleStepCompleted(step: LifecycleStep): boolean {

    const idx = this.lifecycleSteps.findIndex((s) => s.value === step.value);

    return idx >= 0 && idx < this.lifecycleIndex;

  }



  isLifecycleStepDisabled(step: LifecycleStep): boolean {

    if (this.savingEstado) return true;

    if (step.clickable === false) return true;

    if (this.estadoActual === TipoEstadoEvento.CANCELADO) {
      return true;
    }

    if (this.isShowcaseMode && step.value === TipoEstadoEvento.PUBLICADO) {

      return true;

    }

    return false;

  }



  onOpsAction(action: OpsAction): void {

    if (action.disabled) {

      if (action.id === 'ventas') {

        this.alertService.info('Modo demo', 'Las ventas no están disponibles en modo demo.');

      }

      return;

    }



    this.showMoreSheet = false;



    switch (action.id) {

      case 'boletas':

        this.openBoletasDrawer();

        break;

      case 'productos':

        this.openProductosDrawer();

        break;

      case 'escanear':

        if (!this.authService.isOrganizador()) {
          void this.router.navigate(['/escanear-qr']);
        }

        break;

      case 'ventas':

        if (this.authService.isOrganizador()) {
          void this.router.navigate(['/ventas-organizador']);
        } else {
          void this.router.navigate(['/ventas'], { queryParams: { eventoId: this.eventoId } });
        }

        break;

      case 'reservar-palcos':

        this.openPalcosDrawer();

        break;

      case 'cupones':

        this.openCuponesDrawer();

        break;

      case 'mas':
        if (typeof window !== 'undefined' && window.matchMedia('(min-width: 769px)').matches) {
          document.getElementById('ev-ops-advanced-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          this.showMoreSheet = !this.showMoreSheet;
        }
        break;

    }

  }



  closeMoreSheet(): void {

    this.showMoreSheet = false;

  }



  openCuponesDrawer(): void {

    if (!this.evento) {

      return;

    }

    this.showMoreSheet = false;

    const ref = openEventoCuponesDrawer(this.drawerService, this.evento);

    void ref.afterClosed().then((changed) => {

      if (changed) {

        void this.loadPage();

      }

    });

  }



  openPalcosDrawer(): void {

    if (!this.evento) {

      return;

    }

    this.showMoreSheet = false;

    const ref = openEventoPalcosDrawer(this.drawerService, this.evento);

    void ref.afterClosed().then((changed) => {

      if (changed) {

        void this.loadPage();

      }

    });

  }



  openImagenDrawer(): void {

    if (!this.evento) {

      return;

    }

    this.showMoreSheet = false;

    const ref = openEventoImagenDrawer(this.drawerService, this.evento);

    void ref.afterClosed().then((result) => {

      if (!result?.changed || !this.evento) {

        return;

      }

      this.heroImagenVersion += 1;

      this.evento = {

        ...this.evento,

        imagen_principal: result.imagenUrl ?? undefined,

      };

      this.rebuildReadiness();

      this.cdr.markForCheck();

      this.cdr.detectChanges();

    });

  }



  heroImagenSrc(url?: string | null): string | null {

    const trimmed = url?.trim();

    if (!trimmed) {

      return null;

    }

    const separator = trimmed.includes('?') ? '&' : '?';

    return `${trimmed}${separator}v=${this.heroImagenVersion}`;

  }



  openCobrosDrawer(): void {

    if (!this.evento) {

      return;

    }

    this.showMoreSheet = false;

    const ref = openEventoCobrosDrawer(this.drawerService, this.evento);

    void ref.afterClosed().then((result) => {

      if (!result?.changed || !this.evento) {

        return;

      }

      this.evento = {

        ...this.evento,

        es_gratis: result.es_gratis ?? this.evento.es_gratis,

        porcentaje_servicio: result.porcentaje_servicio ?? this.evento.porcentaje_servicio,

        wompi_cuenta_id: result.wompi_cuenta_id ?? null,

      };

      this.rebuildReadiness();

      this.cdr.detectChanges();

    });

  }



  openFechasDrawer(): void {

    if (!this.evento) {

      return;

    }

    this.showMoreSheet = false;

    const ref = openEventoFechasDrawer(this.drawerService, this.evento);

    void ref.afterClosed().then(async (result) => {

      if (!result?.changed || !this.evento) {

        return;

      }

      try {

        this.evento = await this.eventosService.getEventoById(this.eventoId);

        this.rebuildReadiness();

        this.rebuildTimeline();

        this.cdr.detectChanges();

      } catch {

        this.evento = {

          ...this.evento,

          edad_minima: result.edad_minima ?? undefined,

          fecha_inicio: result.fecha_inicio ?? this.evento.fecha_inicio,

          fecha_fin: result.fecha_fin ?? this.evento.fecha_fin,

          fecha_venta_inicio: result.fecha_venta_inicio ?? this.evento.fecha_venta_inicio,

          fecha_venta_fin: result.fecha_venta_fin ?? this.evento.fecha_venta_fin,

        };

        this.rebuildReadiness();

        this.rebuildTimeline();

        this.cdr.detectChanges();

      }

    });

  }



  openBoletasDrawer(): void {

    if (!this.evento) {

      return;

    }

    this.showMoreSheet = false;

    const ref = openEventoBoletasDrawer(this.drawerService, this.evento, {
      onChanged: (result) => this.applyBoletasDrawerResult(result),
    });

    void ref.afterClosed().then((result) => {

      if (!result?.changed) {

        return;

      }

      this.applyBoletasDrawerResult(result);

    });

  }



  openProductosDrawer(): void {

    if (!this.evento) {

      return;

    }

    this.showMoreSheet = false;

    const ref = openEventoProductosDrawer(this.drawerService, this.evento, {
      onChanged: () => void this.refreshProductosResumen(),
    });

    void ref.afterClosed().then((result) => {

      if (!result?.changed) {

        return;

      }

      void this.refreshProductosResumen();

    });

  }



  private applyBoletasDrawerResult(result: { changed: boolean; tiposBoleta?: TipoBoleta[] }): void {

    if (result.tiposBoleta) {

      this.tiposBoleta = result.tiposBoleta;

      this.rebuildReadiness();

      this.cdr.detectChanges();

      return;

    }

    if (result.changed) {

      void this.refreshTiposBoleta();

    }

  }



  private async refreshProductosResumen(): Promise<void> {

    try {

      const [tieneProductos, resumenMap] = await Promise.all([

        this.productosService.eventoTieneProductos(this.eventoId).catch(() => false),

        this.productosService.getResumenProductosPorEvento([this.eventoId]).catch(() => new Map()),

      ]);

      this.tieneProductos = tieneProductos;

      this.productosCount = resumenMap.get(this.eventoId)?.cantidad ?? 0;

      this.rebuildReadiness();

      this.cdr.detectChanges();

    } catch {

      /* noop */

    }

  }



  private async refreshTiposBoleta(): Promise<void> {

    try {

      this.tiposBoleta = await this.boletasService.getTiposBoleta(this.eventoId, {
        includeInactive: true,
      });

      this.rebuildReadiness();

      this.cdr.detectChanges();

    } catch {

      /* noop */

    }

  }



  goToAnalisis(): void {

    void this.router.navigate(['/eventos', this.eventoId, 'inteligencia']);

  }



  goToLectores(): void {

    void this.router.navigate(['/lectores-parametrizacion']);

  }



  goToEditarInfo(): void {

    this.openInformacionDrawer();

  }



  openInformacionDrawer(): void {

    if (!this.evento) {

      return;

    }

    this.showMoreSheet = false;

    const ref = openEventoInformacionDrawer(this.drawerService, this.evento);

    void ref.afterClosed().then(async (result) => {

      if (!result?.changed || !this.evento) {

        return;

      }

      try {

        this.evento = await this.eventosService.getEventoById(this.eventoId);

        this.rebuildReadiness();

        this.cdr.detectChanges();

      } catch {

        this.evento = {

          ...this.evento,

          titulo: result.titulo ?? this.evento.titulo,

          categoria_id: result.categoria_id ?? this.evento.categoria_id,

          lugar_id: result.lugar_id ?? this.evento.lugar_id,

          tags: result.tags ?? this.evento.tags,

          descripcion_corta: result.descripcion_corta ?? this.evento.descripcion_corta,

          descripcion: result.descripcion ?? this.evento.descripcion,

          url_video: result.url_video ?? this.evento.url_video,

          terminos_condiciones: result.terminos_condiciones ?? this.evento.terminos_condiciones,

          politica_reembolso: result.politica_reembolso ?? this.evento.politica_reembolso,

        };

        this.rebuildReadiness();

        this.cdr.detectChanges();

      }

    });

  }



  async onLifecycleStepClick(step: LifecycleStep): Promise<void> {

    if (!this.evento || this.isLifecycleStepDisabled(step) || step.value === this.estadoActual) {

      return;

    }

    if (step.clickable === false) {
      return;
    }

    if (this.isShowcaseMode && step.value === TipoEstadoEvento.PUBLICADO) {

      this.alertService.info('Modo demo', 'En modo demo no se publica al catálogo.');

      return;

    }

    if (step.value === TipoEstadoEvento.PUBLICADO) {

      if (!this.canPublishEvento) {

        this.notifyPublishNotReady();

        return;

      }

      await this.publicarEvento();

      return;

    }

    if (step.value === TipoEstadoEvento.FINALIZADO) {
      const ok = await this.alertService.confirm(
        'Finalizar evento',
        'El evento pasará a Finalizado y saldrá del catálogo (ya no estará visible para comprar). ¿Continuar?',
        'Sí, finalizar',
        'Volver',
      );
      if (!ok) return;
    }

    this.savingEstado = true;

    this.cdr.detectChanges();

    try {

      const payload =
        step.value === TipoEstadoEvento.BORRADOR
          ? patchBorrador()
          : step.value === TipoEstadoEvento.FINALIZADO
            ? patchFinalizado()
            : { estado: step.value };

      const updated = await this.eventosService.updateEvento(this.evento.id, payload);

      this.evento = { ...this.evento, ...updated, lugar: this.evento.lugar };

      this.rebuildReadiness();

      this.rebuildTimeline();

    } catch (err) {

      console.error('Error actualizando estado:', err);

      this.alertService.error('Error', 'No se pudo cambiar el estado del evento.');

    } finally {

      this.savingEstado = false;

      this.cdr.detectChanges();

    }

  }



  async onPrimaryAction(): Promise<void> {

    if (!this.evento) return;



    switch (this.estadoVisual) {

      case TipoEstadoEvento.FINALIZADO:

      case TipoEstadoEvento.CANCELADO:

        void this.router.navigate(['/eventos', this.eventoId, 'inteligencia']);

        return;

      case TipoEstadoEvento.PUBLICADO:
      case TipoEstadoEvento.EN_CURSO:

        await this.toggleCatalogo();

        return;

      default:

        if (!this.canPublishEvento) {

          this.notifyPublishNotReady();

          return;

        }

        await this.publicarEvento();

    }

  }



  private notifyPublishNotReady(): void {

    if (!this.readiness) return;

    const pending = getPrePublishPendingSteps(this.readiness);

    if (pending.length === 0) return;

    this.alertService.warning(

      'Aún no puedes publicar',

      formatPrePublishPendingMessage(pending),

    );

  }



  async publicarEvento(): Promise<void> {

    if (!this.evento) return;

    if (this.isShowcaseMode) {

      this.alertService.info('Modo demo', 'En modo demo no se publica al catálogo.');

      return;

    }

    if (this.readiness && !isEventoReadyToPublish(this.readiness)) {

      this.notifyPublishNotReady();

      return;

    }

    this.publishing = true;

    this.cdr.detectChanges();

    try {

      const updated = await this.eventosService.updateEvento(this.evento.id, {

        estado: TipoEstadoEvento.PUBLICADO,

        activo: true,

      });

      this.evento = { ...this.evento, ...updated, lugar: this.evento.lugar };

      this.rebuildReadiness();

      this.rebuildTimeline();

      this.alertService.success('Publicado', 'Tu evento ya está disponible en el catálogo.');

    } catch (err) {

      console.error('Error publicando evento:', err);

      this.alertService.error('Error', 'No se pudo publicar el evento.');

    } finally {

      this.publishing = false;

      this.cdr.detectChanges();

    }

  }



  async toggleLiquidado(): Promise<void> {
    if (!this.evento || !this.canToggleLiquidado || this.savingLiquidado) return;

    const next = !this.isLiquidado;
    const ok = await this.alertService.confirm(
      next ? 'Marcar como liquidado' : 'Reabrir liquidación',
      next
        ? 'El evento dejará de sumar en los dashboards globales (admin, organizador y dashboard-eventos). Inteligencia del evento seguirá mostrando los números.'
        : 'El evento volverá a contar en los dashboards globales.',
    );
    if (!ok) return;

    this.savingLiquidado = true;
    this.cdr.detectChanges();
    try {
      const updated = await this.eventosService.updateEvento(this.evento.id, { liquidado: next });
      this.evento = { ...this.evento, ...updated, lugar: this.evento.lugar };
      this.alertService.snackbarSuccess(
        next ? 'Evento liquidado' : 'Liquidación reabierta',
        next ? 'Ya no cuenta en dashboards globales.' : 'Vuelve a contar en dashboards globales.',
      );
    } catch (err) {
      console.error('Error actualizando liquidado:', err);
      this.alertService.error('Error', 'No se pudo actualizar el estado de liquidación.');
    } finally {
      this.savingLiquidado = false;
      this.cdr.detectChanges();
    }
  }

  async toggleCatalogo(): Promise<void> {

    if (!this.evento) return;

    if (this.isShowcaseMode) {

      this.alertService.info('Modo demo', 'En modo demo el evento no se publica al catálogo.');

      return;

    }

    const nextActivo = !this.evento.activo;

    if (nextActivo && this.estadoActual === TipoEstadoEvento.BORRADOR) {

      await this.publicarEvento();

      return;

    }

    const ok = await this.alertService.confirm(
      nextActivo ? 'Mostrar en catálogo' : 'Ocultar del catálogo',
      nextActivo
        ? 'El evento volverá a estar visible para comprar en el catálogo. ¿Continuar?'
        : 'El evento dejará de aparecer en el catálogo y no se podrá comprar hasta que lo vuelvas a mostrar. ¿Continuar?',
      nextActivo ? 'Sí, mostrar' : 'Sí, ocultar',
      'Cancelar',
    );
    if (!ok) return;

    this.publishing = true;

    this.cdr.detectChanges();

    try {

      const payload = nextActivo ? patchPublicadoEnCatalogo() : patchFueraDeCatalogo();

      const updated = await this.eventosService.updateEvento(this.evento.id, payload);

      this.evento = { ...this.evento, ...updated, lugar: this.evento.lugar };

      this.rebuildReadiness();

      this.rebuildTimeline();

    } catch (err) {

      console.error('Error actualizando catálogo:', err);

      this.alertService.error('Error', 'No se pudo actualizar el catálogo.');

    } finally {

      this.publishing = false;

      this.cdr.detectChanges();

    }

  }



  isReadinessStepDisabled(step: EventoReadinessStep): boolean {

    if (
      step.complete &&
      step.id !== 'publicacion' &&
      step.id !== 'informacion' &&
      step.id !== 'imagen' &&
      step.id !== 'fechas' &&
      step.id !== 'cobros' &&
      step.id !== 'boletas' &&
      step.id !== 'productos'
    ) {

      return true;

    }

    return false;

  }



  onReadinessStepClick(step: EventoReadinessStep): void {

    if (!this.evento || this.isReadinessStepDisabled(step)) return;

    switch (step.action) {

      case 'informacion':

        this.openInformacionDrawer();

        break;

      case 'imagen':

        this.openImagenDrawer();

        break;

      case 'cobros':

        this.openCobrosDrawer();

        break;

      case 'boletas':

        this.openBoletasDrawer();

        break;

      case 'fechas':

        this.openFechasDrawer();

        break;

      case 'wizard':

        void this.router.navigate(['/eventos'], {

          queryParams: { edit: this.evento.id, step: step.wizardStep ?? 0 },

        });

        break;

      case 'productos':

        this.openProductosDrawer();

        break;

      case 'publish':

        if (!this.canPublishEvento) {

          this.notifyPublishNotReady();

          return;

        }

        void this.publicarEvento();

        break;

    }

  }

}


