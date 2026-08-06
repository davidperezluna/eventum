import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EventosService } from '../../services/eventos.service';
import { BoletasService } from '../../services/boletas.service';
import { ProductosService } from '../../services/productos.service';
import { DashboardService } from '../../services/dashboard.service';
import { DashboardOrganizadorService } from '../../services/dashboard-organizador.service';
import { ReportesService, ReporteEvento, ReporteVentas } from '../../services/reportes.service';
import { AuthService } from '../../services/auth.service';
import { AlertService } from '../../services/alert.service';
import { Evento, TipoBoleta, TipoEstadoEvento, DashboardStats, Producto } from '../../types';
import { DateFormatPipe } from '../../pipes/date-format.pipe';
import {
  IntelActionNow,
  IntelHeroMoment,
  IntelPulseCard,
  IntelStorySection,
  IntelCtaAction,
} from './evento-inteligencia.types';
import {
  buildActionNow,
  buildAforoStory,
  buildHeroMoment,
  buildHoyStory,
  buildProductosStory,
  buildPulseCards,
  buildVentasStory,
  computeAforoTotals,
  computeRecaudoTotal,
  formatIntelCurrency,
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
  imports: [CommonModule, RouterLink, DateFormatPipe],
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

  hero: IntelHeroMoment | null = null;
  pulseCards: IntelPulseCard[] = [];
  actionNow: IntelActionNow | null = null;
  ventasStory: IntelStorySection | null = null;
  hoyStory: IntelStorySection | null = null;
  aforoStory: IntelStorySection | null = null;
  productosStory: IntelStorySection | null = null;
  boletasRanking: BoletaRankingRow[] = [];
  productosRows: ProductoRow[] = [];

  loading = true;
  refreshing = false;
  eventoId = 0;

  readonly padCountdown = padCountdown;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    public authService: AuthService,
    private eventosService: EventosService,
    private boletasService: BoletasService,
    private productosService: ProductosService,
    private dashboardService: DashboardService,
    private dashboardOrganizadorService: DashboardOrganizadorService,
    private reportesService: ReportesService,
    private alertService: AlertService,
    private cdr: ChangeDetectorRef,
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
      this.evento = evento;

      const orgId = this.authService.isOrganizador() ? this.authService.getUsuarioId() : null;
      const { desde, hasta } = this.rangoVentas7d();

      const [tipos, productos, stats, reporte, ventas7d] = await Promise.all([
        this.boletasService.getTiposBoleta(this.eventoId).catch(() => [] as TipoBoleta[]),
        this.productosService.getProductosPorEvento(this.eventoId, false).catch(() => [] as Producto[]),
        orgId != null
          ? this.dashboardOrganizadorService.getStats(orgId, this.eventoId).catch(() => null)
          : this.dashboardService.getStats(this.eventoId).catch(() => null),
        this.reportesService.getReporteEvento(this.eventoId).catch(() => null),
        this.reportesService
          .getVentasPorDia(desde, hasta, orgId ?? undefined, this.eventoId)
          .catch(() => [] as ReporteVentas[]),
      ]);

      this.tiposBoleta = tipos;
      this.productos = productos;
      this.stats = stats;
      this.reporte = reporte;
      this.ventas7d = ventas7d;

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
      this.pulseCards = [];
      this.actionNow = null;
      this.ventasStory = null;
      this.hoyStory = null;
      this.aforoStory = null;
      this.productosStory = null;
      return;
    }

    const aforo = computeAforoTotals(this.tiposBoleta);
    const hero = buildHeroMoment(this.evento, aforo);
    const fmt = (n: number) => this.formatCurrency(n);
    this.hero = hero;
    this.pulseCards = buildPulseCards(this.reporte, this.stats, aforo, fmt);
    this.actionNow = buildActionNow(this.evento, this.reporte, aforo, hero);
    this.boletasRanking = this.buildBoletasRanking();
    this.productosRows = this.buildProductosRows();
    this.ventasStory = buildVentasStory(this.reporte, this.stats, this.ventas7d, fmt);
    this.hoyStory = buildHoyStory(this.stats, this.reporte, fmt);
    this.aforoStory = buildAforoStory(this.boletasRanking, aforo);
    this.productosStory = buildProductosStory(this.productos.length, this.productosRows, fmt);
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
        return {
          nombre: t.nombre,
          vendidas,
          total,
          pct: total > 0 ? Math.round((vendidas / total) * 100) : 0,
          ingresosEst: vendidas * (t.precio ?? 0),
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
      .slice(0, 5);
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

  get iniciales(): string {
    const titulo = this.evento?.titulo?.trim() ?? '';
    const words = titulo.split(/\s+/).filter(Boolean);
    if (words.length === 0) return 'EV';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }

  get recaudoEntradas(): number {
    return this.reporte?.ingresos ?? 0;
  }

  get recaudoProductos(): number {
    return this.stats?.ingresos_productos_totales ?? 0;
  }

  get recaudoTotal(): number {
    return computeRecaudoTotal(this.reporte, this.stats);
  }

  get recaudoEntradasPct(): number {
    const total = this.recaudoTotal;
    if (total <= 0) return 0;
    return Math.round((this.recaudoEntradas / total) * 100);
  }

  get recaudoProductosPct(): number {
    const total = this.recaudoTotal;
    if (total <= 0) return 0;
    return Math.round((this.recaudoProductos / total) * 100);
  }

  get ventasSparkMax(): number {
    return Math.max(1, ...this.ventas7d.map((v) => v.ingresos ?? 0));
  }

  sparkHeight(ingresos: number): number {
    const max = this.ventasSparkMax;
    return Math.max(8, Math.round((ingresos / max) * 100));
  }

  heroImagenSrc(url?: string | null): string | null {
    const trimmed = url?.trim();
    if (!trimmed) return null;
    return trimmed;
  }

  formatCurrency(value: number | undefined | null): string {
    return formatIntelCurrency(Number(value ?? 0));
  }

  goToOperaciones(): void {
    void this.router.navigate(['/eventos', this.eventoId, 'operaciones']);
  }

  verEventoPublico(): void {
    if (!this.evento) return;
    window.open(`/detalle-evento/${this.evento.id}`, '_blank', 'noopener,noreferrer');
  }

  goToEscanear(): void {
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

  async compartirEvento(): Promise<void> {
    if (!this.evento) return;
    const url = `${window.location.origin}/detalle-evento/${this.evento.id}`;
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

  get rankingConVentas(): BoletaRankingRow[] {
    return this.boletasRanking.filter((r) => r.vendidas > 0);
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
    }
  }

  onActionNowClick(): void {
    if (!this.actionNow) return;
    switch (this.actionNow.ctaAction) {
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
    }
  }

  refresh(): void {
    void this.loadPage(true);
  }
}
