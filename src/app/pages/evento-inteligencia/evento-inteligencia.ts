import { Component, OnInit, ChangeDetectorRef, NgZone } from '@angular/core';

import { CommonModule } from '@angular/common';

import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { EventosService } from '../../services/eventos.service';

import { BoletasService } from '../../services/boletas.service';

import { ProductosService } from '../../services/productos.service';

import { CuponesService } from '../../services/cupones.service';

import { DashboardService } from '../../services/dashboard.service';

import { DashboardOrganizadorService } from '../../services/dashboard-organizador.service';

import { ReportesService, ReporteEvento, ReporteVentas } from '../../services/reportes.service';

import { DemoDataProvider } from '../../demo/demo-data.provider';

import { AuthService } from '../../services/auth.service';

import { AlertService } from '../../services/alert.service';

import { Evento, TipoBoleta, TipoEstadoEvento, DashboardStats, Producto } from '../../types';

import { DateFormatPipe } from '../../pipes/date-format.pipe';

import { EvButton } from '../../components/ev-button';

import {
  buildEventoQrPosterDataUrl,
  getEventoPublicUrl,
  shareEventoQrPoster,
} from '../../core/evento-qr-poster';

import { formatFinanzasMonedaExacta, formatFinanzasMontoExacto } from '../../utils/dashboard-finanzas.view';

import {

  IntelActionNow,

  IntelFinanzasHeroView,

  IntelHeroMoment,

  IntelHoySection,

  IntelOportunidadesSection,

  IntelPulseCard,

  IntelRankingSection,

  IntelVentasSection,

  IntelCtaAction,

} from './evento-inteligencia.types';

import {

  buildActionNow,

  buildBoletasRankingSection,

  buildHeroMoment,

  buildHoySection,

  buildOportunidadesSection,

  buildProductosRankingSection,

  buildIntelFinanzasHero,

  buildPulseCards,

  buildVentasSection,

  applyIntelCtaPolicy,

  computeAforoTotals,

  padCountdown,

} from './evento-inteligencia.utils';



interface BoletaRankingRow {

  nombre: string;

  vendidas: number;

  total: number;

  pct: number;

  ingresosEst: number;

}



interface ProductoRow {

  nombre: string;

  vendidas: number;

  ingresosEst: number;

}



@Component({

  selector: 'app-evento-inteligencia',

  standalone: true,

  imports: [CommonModule, RouterLink, DateFormatPipe, EvButton],

  templateUrl: './evento-inteligencia.html',

  styleUrls: ['./evento-inteligencia.css', '../eventos/eventos.css'],

})

export class EventoInteligencia implements OnInit {

  evento: Evento | null = null;

  tiposBoleta: TipoBoleta[] = [];

  productos: Producto[] = [];

  stats: DashboardStats | null = null;

  reporte: ReporteEvento | null = null;

  ventas7d: ReporteVentas[] = [];

  cuponesCount = 0;

  /** Ingresos netos (post-descuento) por tipo_boleta_id desde compras reales. */
  private ingresosNetosPorTipo = new Map<number, number>();



  hero: IntelHeroMoment | null = null;

  finanzasHero: IntelFinanzasHeroView | null = null;

  pulseCards: IntelPulseCard[] = [];

  actionNow: IntelActionNow | null = null;

  ventasSection: IntelVentasSection | null = null;

  boletasSection: IntelRankingSection | null = null;

  productosSection: IntelRankingSection | null = null;

  hoySection: IntelHoySection | null = null;

  oportunidadesSection: IntelOportunidadesSection | null = null;



  loading = true;

  refreshing = false;

  eventoId = 0;

  qrModalOpen = false;

  qrPosterLoading = false;

  qrPosterSharing = false;

  qrPosterUrl: string | null = null;



  readonly padCountdown = padCountdown;



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

    private cdr: ChangeDetectorRef,

    private ngZone: NgZone,

  ) {}



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



  async loadPage(manual = false): Promise<void> {

    if (manual) {

      this.refreshing = true;

    } else {

      this.loading = true;

    }

    this.cdr.detectChanges();



    try {

      const evento = await this.eventosService.getEventoById(this.eventoId);

      if (!this.canAccessEvento(evento)) {

        this.alertService.warning('Acceso denegado', 'No tienes permiso para ver este evento.');

        void this.router.navigate(['/eventos']);

        return;

      }

      this.evento = await this.demoDataProvider.applyEventoPresentation(evento);



      const orgId = this.authService.isOrganizador() ? this.authService.getUsuarioId() : null;

      const { desde, hasta } = this.rangoVentas7d();



      const [tipos, productos, stats, reporte, ventas7d, cupones, ingresosPorTipo] = await Promise.all([

        this.boletasService
          .getTiposBoleta(this.eventoId, { includeInactive: true })
          .catch(() => [] as TipoBoleta[]),

        this.productosService.getProductosPorEvento(this.eventoId, false).catch(() => [] as Producto[]),

        orgId != null

          ? this.demoDataProvider.getEventDashboardStats(orgId, this.eventoId).catch(() => null)

          : this.demoDataProvider.getEventDashboardStats(null, this.eventoId).catch(() => null),

        this.demoDataProvider.getReporteEvento(orgId, this.eventoId).catch(() => null),

        this.demoDataProvider

          .getVentasPorDia(desde, hasta, orgId ?? undefined, this.eventoId)

          .catch(() => [] as ReporteVentas[]),

        this.cuponesService.getCuponesByEvento(this.eventoId).catch(() => []),

        this.reportesService.getIngresosNetosPorTipoBoleta(this.eventoId).catch(
          () => new Map<number, { vendidas: number; ingresosNetos: number }>(),
        ),

      ]);



      this.tiposBoleta = await this.demoDataProvider.applyTiposBoleta(tipos, this.eventoId);

      this.productos = await this.demoDataProvider.applyProductos(productos, this.eventoId);

      this.stats = stats;

      this.reporte = reporte;

      this.ventas7d = ventas7d;

      this.ingresosNetosPorTipo = new Map(
        [...ingresosPorTipo.entries()].map(([id, row]) => [id, row.ingresosNetos]),
      );

      const cuponesDemo = await this.demoDataProvider.applyCupones(cupones, this.eventoId);

      this.cuponesCount = cuponesDemo.length;



      this.rebuildIntel();

    } catch (err) {

      console.error('Error cargando inteligencia del evento:', err);

      this.alertService.error('Error', 'No se pudo cargar el centro de inteligencia.');

    } finally {

      this.loading = false;

      this.refreshing = false;

      this.cdr.detectChanges();

    }

  }



  private rebuildIntel(): void {

    if (!this.evento) {

      this.hero = null;

      this.finanzasHero = null;

      this.pulseCards = [];

      this.actionNow = null;

      this.ventasSection = null;

      this.boletasSection = null;

      this.productosSection = null;

      this.hoySection = null;

      this.oportunidadesSection = null;

      return;

    }



    const aforo = computeAforoTotals(this.tiposBoleta);

    const hero = buildHeroMoment(this.evento, aforo);

    const fmtFinanzas = (n: number) => formatFinanzasMonedaExacta(n);

    const fmtMonto = (n: number) => formatFinanzasMontoExacto(n);

    const boletasRanking = this.buildBoletasRanking();

    const productosRows = this.buildProductosRows();



    this.hero = hero;

    this.finanzasHero = buildIntelFinanzasHero(this.stats, fmtFinanzas, fmtMonto);

    this.pulseCards = buildPulseCards(this.reporte, this.stats, aforo, {
      hideScanner: true,
    });

    this.actionNow = buildActionNow(this.evento, this.reporte, aforo, hero, {
      hideScanner: true,
    });

    this.ventasSection = buildVentasSection(this.stats, fmtFinanzas);

    this.boletasSection = buildBoletasRankingSection(boletasRanking, aforo, fmtFinanzas);

    this.productosSection = buildProductosRankingSection(this.productos.length, productosRows, fmtFinanzas);

    this.hoySection = buildHoySection(this.stats, this.ventas7d, this.productos.length > 0, fmtFinanzas);

    this.oportunidadesSection = buildOportunidadesSection({

      rankingBoletas: boletasRanking,

      rankingProductos: productosRows,

      productosCount: this.productos.length,

      cuponesCount: this.cuponesCount,

      tiposBoletaCount: this.tiposBoleta.length,

      reporte: this.reporte,

      stats: this.stats,

      aforo,

    });



    applyIntelCtaPolicy(
      this.actionNow,
      [this.ventasSection, this.boletasSection, this.productosSection, this.hoySection],
      this.oportunidadesSection,
    );

  }



  private canAccessEvento(evento: Evento): boolean {

    if (!this.authService.isOrganizador()) {

      return true;

    }

    const orgId = this.authService.getUsuarioId();

    return orgId != null && evento.organizador_id === orgId;

  }



  private rangoVentas7d(): { desde: string; hasta: string } {

    const hasta = new Date();

    const desde = new Date();

    desde.setDate(desde.getDate() - 6);

    return {

      desde: this.toIsoDateLocal(desde),

      hasta: this.toIsoDateLocal(hasta),

    };

  }



  private toIsoDateLocal(d: Date): string {

    const y = d.getFullYear();

    const m = String(d.getMonth() + 1).padStart(2, '0');

    const day = String(d.getDate()).padStart(2, '0');

    return `${y}-${m}-${day}`;

  }



  private buildBoletasRanking(): BoletaRankingRow[] {

    return this.tiposBoleta

      .map((t) => {

        const vendidas = t.cantidad_vendidas ?? 0;

        const total = t.cantidad_total ?? 0;

        const ingresosReales = this.ingresosNetosPorTipo.get(t.id);

        return {

          nombre: t.nombre,

          vendidas,

          total,

          pct: total > 0 ? Math.round((vendidas / total) * 100) : 0,

          // Preferir neto post-descuento (cupón / venta manual $0); fallback solo si no hay compras.
          ingresosEst:
            ingresosReales !== undefined ? ingresosReales : vendidas * (t.precio ?? 0),

        };

      })

      .sort((a, b) => b.vendidas - a.vendidas);

  }



  private buildProductosRows(): ProductoRow[] {

    return this.productos

      .map((p) => {

        const vendidas = p.cantidad_vendidas ?? 0;

        const precio = p.precio ?? 0;

        return {

          nombre: p.nombre,

          vendidas,

          ingresosEst: vendidas * precio,

        };

      })

      .filter((p) => p.vendidas > 0)

      .sort((a, b) => b.ingresosEst - a.ingresosEst)

      .slice(0, 6);

  }



  get estadoActual(): TipoEstadoEvento {

    return (this.evento?.estado as TipoEstadoEvento) ?? TipoEstadoEvento.BORRADOR;

  }



  get estadoLabel(): string {

    const labels: Record<TipoEstadoEvento, string> = {

      [TipoEstadoEvento.BORRADOR]: 'Borrador',

      [TipoEstadoEvento.PUBLICADO]: 'Publicado',

      [TipoEstadoEvento.EN_CURSO]: 'En curso',

      [TipoEstadoEvento.FINALIZADO]: 'Finalizado',

      [TipoEstadoEvento.CANCELADO]: 'Cancelado',

    };

    return labels[this.estadoActual] ?? 'Sin estado';

  }



  get lugarLabel(): string {

    const lugar = this.evento?.lugar;

    if (!lugar?.nombre) return 'Sin lugar asignado';

    return lugar.ciudad ? `${lugar.nombre}, ${lugar.ciudad}` : lugar.nombre;

  }



  formatCurrency(value: number | undefined | null): string {
    return formatFinanzasMonedaExacta(Number(value ?? 0));
  }



  goToOperaciones(): void {

    void this.router.navigate(['/eventos', this.eventoId, 'operaciones']);

  }



  verEventoPublico(): void {

    if (!this.evento) return;

    window.open(`/detalle-evento/${this.evento.id}`, '_blank', 'noopener,noreferrer');

  }



  goToEscanear(): void {

    if (this.authService.isOrganizador()) {
      this.goToOperaciones();
      return;
    }

    void this.router.navigate(['/escanear-qr'], {

      queryParams: { eventoId: this.eventoId },

    });

  }



  goToBoletas(): void {

    void this.router.navigate(['/eventos', this.eventoId, 'operaciones'], {

      queryParams: { open: 'boletas' },

    });

  }



  goToProductos(): void {

    void this.router.navigate(['/eventos', this.eventoId, 'operaciones'], {

      queryParams: { open: 'productos' },

    });

  }



  goToCupones(): void {

    void this.router.navigate(['/eventos', this.eventoId, 'operaciones'], {

      queryParams: { open: 'cupones' },

    });

  }



  async compartirEvento(): Promise<void> {

    if (!this.evento) return;

    const url = getEventoPublicUrl(this.evento.id);

    const title = this.evento.titulo ?? 'Evento';



    try {

      if (typeof navigator.share === 'function') {

        await navigator.share({ title, url });

        return;

      }

      await navigator.clipboard.writeText(url);

      this.alertService.success('Enlace copiado', 'Pega el enlace donde quieras compartir tu evento.');

    } catch (err) {

      if ((err as Error)?.name === 'AbortError') return;

      this.alertService.info('Compartir', url);

    }

  }



  async abrirCompartirQrEvento(): Promise<void> {

    if (!this.evento) return;

    this.qrModalOpen = true;

    this.qrPosterLoading = true;

    this.qrPosterUrl = null;

    this.cdr.detectChanges();

    const titulo = this.evento.titulo ?? 'Evento';

    const url = getEventoPublicUrl(this.evento.id);

    try {

      const dataUrl = await buildEventoQrPosterDataUrl(titulo, url);

      this.ngZone.run(() => {

        this.qrPosterUrl = dataUrl;

        this.qrPosterLoading = false;

        this.cdr.markForCheck();

      });

    } catch (err) {

      console.error('Error generando QR del evento:', err);

      this.ngZone.run(() => {

        this.qrModalOpen = false;

        this.qrPosterLoading = false;

        this.qrPosterUrl = null;

        this.cdr.markForCheck();

      });

      this.alertService.error('No se pudo crear el QR', 'Intenta de nuevo en unos segundos.');

    }

  }



  cerrarCompartirQrEvento(): void {

    this.qrModalOpen = false;

    this.qrPosterLoading = false;

    this.qrPosterSharing = false;

    this.qrPosterUrl = null;

  }



  async compartirQrPoster(): Promise<void> {

    if (!this.evento || !this.qrPosterUrl || this.qrPosterSharing) return;

    this.qrPosterSharing = true;

    this.ngZone.run(() => this.cdr.markForCheck());

    try {

      const titulo = this.evento.titulo ?? 'Evento';

      const result = await shareEventoQrPoster(titulo, this.qrPosterUrl);

      if (result === 'downloaded') {

        this.alertService.success('Imagen lista', 'La descargamos para que la puedas compartir.');

      }

    } catch (err) {

      if ((err as Error)?.name === 'AbortError') return;

      console.error('Error compartiendo QR del evento:', err);

      this.alertService.error('No se pudo compartir', 'Cierra y vuelve a abrir el QR para intentarlo de nuevo.');

    } finally {

      this.ngZone.run(() => {

        this.qrPosterSharing = false;

        this.cdr.markForCheck();

      });

    }

  }



  onStoryCta(action?: IntelCtaAction): void {

    if (!action) return;

    switch (action) {

      case 'share':

        void this.compartirEvento();

        break;

      case 'operaciones':

        this.goToOperaciones();

        break;

      case 'escanear':

        this.goToEscanear();

        break;

      case 'boletas':

        this.goToBoletas();

        break;

      case 'productos':

        this.goToProductos();

        break;

      case 'cupones':

        this.goToCupones();

        break;

    }

  }



  onActionNowClick(): void {

    if (!this.actionNow) return;

    this.onStoryCta(this.actionNow.ctaAction);

  }



  refresh(): void {

    void this.loadPage(true);

  }

}


