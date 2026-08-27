import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { EventosService } from '../../services/eventos.service';
import { BoletasService } from '../../services/boletas.service';
import { ProductosService } from '../../services/productos.service';
import { CarritoCompraService } from '../../services/carrito-compra.service';
import { ClientConfirmDialogService } from '../../services/client-confirm-dialog.service';
import { AlertService } from '../../services/alert.service';
import {
  DetalleEventoState,
  DetalleEventoStateService,
} from '../../services/detalle-evento-state.service';
import { resolverConflictoEventoAntesDeAgregar } from '../../core/carrito-conflicto';
import {
  cantidadPalcosReservadosTipo,
  cuposPorPalcoTipo,
  descripcionTipoBoletaVisible,
  esLineaPalcoMultipersonaTipo,
  eventoCompraFinalizado,
  mostrarFinVentaTipoBoleta,
  normalizarTiposBoletaActivos,
  tiposBoletaAgotados,
  tiposBoletaConExistencias,
  isTipoBoletaEnVenta,
} from '../../core/catalogo-compra-evento';
import { Evento, Palco, Producto, TipoBoleta } from '../../types';
import { environment } from '../../../environments/environment';
import { DateFormatPipe } from '../../pipes/date-format.pipe';
import { EventoProductosTab } from '../../components/evento-productos-tab/evento-productos-tab';
import { EventoBoletaCard } from '../../components/evento-boleta-card/evento-boleta-card';

type CatalogoTipo = 'boletas' | 'productos';

@Component({
  selector: 'app-carrito-agregar',
  imports: [CommonModule, RouterModule, DateFormatPipe, EventoProductosTab, EventoBoletaCard],
  templateUrl: './carrito-agregar.html',
  styleUrl: './carrito-agregar.css',
})
export class CarritoAgregar implements OnInit, OnDestroy {
  readonly mostrarMetricasEntradasDisponibles = environment.mostrarMetricasEntradasDisponibles === true;

  evento: Evento | null = null;
  catalogoTipo: CatalogoTipo = 'boletas';
  loading = true;
  loadingBoletas = true;
  loadingProductosFlag = true;
  tiposBoleta: TipoBoleta[] = [];
  productosCache: Producto[] = [];
  tieneProductos = false;
  etapasAgotadasAbierto = false;

  private currentEventoId: number | null = null;
  private palcosDisponiblesPorTipo = new Map<number, Palco[]>();
  private palcosCatalogoPorTipo = new Map<number, Palco[]>();
  private carritoSub?: Subscription;
  private refreshIndicatorTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly refreshIndicatorDelayMs = 800;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private eventosService: EventosService,
    private boletasService: BoletasService,
    private productosService: ProductosService,
    private carritoCompraService: CarritoCompraService,
    private clientConfirmDialog: ClientConfirmDialogService,
    private alertService: AlertService,
    private detalleEventoStateService: DetalleEventoStateService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.carritoSub = this.carritoCompraService.totalItems$.subscribe(() => {
      this.cdr.detectChanges();
    });

    this.route.paramMap.subscribe((params) => {
      const eventoId = Number(params.get('eventoId'));
      const tipoParam = params.get('tipo');
      if (!Number.isFinite(eventoId) || (tipoParam !== 'boletas' && tipoParam !== 'productos')) {
        void this.router.navigate(['/carrito']);
        return;
      }

      this.catalogoTipo = tipoParam;
      this.currentEventoId = eventoId;

      const cachedState = this.detalleEventoStateService.getState(eventoId);
      if (cachedState) {
        this.applyCachedState(cachedState);
        this.loading = false;
        this.loadingBoletas = false;
        this.loadingProductosFlag = false;
      } else {
        this.loading = true;
        this.loadingBoletas = true;
        this.loadingProductosFlag = true;
      }

      void this.cargarCatalogo(eventoId, { background: !!cachedState });
    });
  }

  ngOnDestroy(): void {
    this.carritoSub?.unsubscribe();
    this.stopSilentRefreshIndicator();
    this.persistState(Date.now());
  }

  get esBoletas(): boolean {
    return this.catalogoTipo === 'boletas';
  }

  get tituloCatalogo(): string {
    return this.esBoletas ? 'Agregar boletas' : 'Agregar productos';
  }

  get otroCatalogoLabel(): string {
    return this.esBoletas ? 'productos' : 'boletas';
  }

  get catalogoCompraListo(): boolean {
    return !this.loadingBoletas && !this.loadingProductosFlag;
  }

  get tiposBoletaDisponibles(): TipoBoleta[] {
    return tiposBoletaConExistencias(this.tiposBoleta, (t) => this.maxCantidadBoleta(t));
  }

  get tiposBoletaAgotadosList(): TipoBoleta[] {
    return tiposBoletaAgotados(this.tiposBoleta, (t) => this.maxCantidadBoleta(t));
  }

  get tieneEntradasEnVenta(): boolean {
    return this.tiposBoletaDisponibles.length > 0;
  }

  get mostrarAlternativaCatalogo(): boolean {
    return this.catalogoCompraListo && this.tieneEntradasEnVenta && this.tieneProductos;
  }

  get totalItemsCarrito(): number {
    return (
      this.carritoCompraService.getItemsSnapshot().reduce((acc, item) => acc + item.cantidad, 0) +
      this.carritoCompraService.getItemsProductosSnapshot().reduce((acc, item) => acc + item.cantidad, 0)
    );
  }

  get subtotalCarrito(): number {
    return this.carritoCompraService.getSubtotalCombinado();
  }

  get eventoFinalizado(): boolean {
    return this.evento ? eventoCompraFinalizado(this.evento) : false;
  }

  volverAlCarrito(): void {
    void this.router.navigate(['/carrito']);
  }

  irOtroCatalogo(): void {
    if (!this.evento?.id) return;
    const tipo: CatalogoTipo = this.esBoletas ? 'productos' : 'boletas';
    void this.router.navigate(['/carrito/agregar', this.evento.id, tipo]);
  }

  toggleEtapasAgotadas(): void {
    this.etapasAgotadasAbierto = !this.etapasAgotadasAbierto;
  }

  descripcionTipoVisible(tipo: TipoBoleta): boolean {
    return descripcionTipoBoletaVisible(tipo);
  }

  mostrarFinVentaTipo(tipo: TipoBoleta): boolean {
    return mostrarFinVentaTipoBoleta(this.evento, tipo);
  }

  esLineaPalcoMultipersona(tipo: TipoBoleta): boolean {
    return esLineaPalcoMultipersonaTipo(tipo);
  }

  cuposPorPalco(tipo: TipoBoleta): number {
    return cuposPorPalcoTipo(tipo);
  }

  cantidadPalcosReservados(tipo: TipoBoleta): number {
    return cantidadPalcosReservadosTipo(tipo, this.palcosCatalogoPorTipo);
  }

  tieneExistencias(tipo: TipoBoleta): boolean {
    return this.maxCantidadBoleta(tipo) > 0;
  }

  getCantidadBoleta(tipoId: number): number {
    return this.carritoCompraService.getCantidadEnCarrito(tipoId);
  }

  maxCantidadBoleta(tipo: TipoBoleta): number {
    if (this.evento && !isTipoBoletaEnVenta(this.evento, tipo)) {
      return 0;
    }
    const stockPalcos = this.esLineaPalcoMultipersona(tipo)
      ? (this.palcosDisponiblesPorTipo.get(tipo.id) ?? []).length
      : null;
    return this.carritoCompraService.maxCantidadBoleta(tipo, stockPalcos);
  }

  puedeAgregarMasBoletas(tipo: TipoBoleta): boolean {
    return (
      this.tieneExistencias(tipo) &&
      this.getCantidadBoleta(tipo.id) < this.maxCantidadBoleta(tipo)
    );
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }

  getPorcentajeServicio(): number {
    const raw = Number(this.evento?.porcentaje_servicio ?? 0);
    if (!Number.isFinite(raw)) return 0;
    return Math.min(100, Math.max(0, raw));
  }

  getPrecioBoletaConServicio(tipo: TipoBoleta): number {
    return Number(tipo.precio || 0) * (1 + this.getPorcentajeServicio() / 100);
  }

  async agregarBoleta(tipo: TipoBoleta): Promise<void> {
    if (!this.puedeAgregarMasBoletas(tipo) || !this.evento) return;
    const ok = await resolverConflictoEventoAntesDeAgregar(
      this.clientConfirmDialog,
      this.carritoCompraService,
      this.evento.titulo,
    );
    if (!ok) return;
    this.carritoCompraService.syncEvento(this.evento);
    this.carritoCompraService.agregarAlCarrito(tipo, undefined, this.maxCantidadBoleta(tipo));
    this.cdr.detectChanges();
  }

  quitarBoleta(tipo: TipoBoleta): void {
    this.carritoCompraService.quitarDelCarrito(tipo.id);
    this.cdr.detectChanges();
  }

  eliminarBoleta(tipo: TipoBoleta): void {
    this.carritoCompraService.eliminarDelCarrito(tipo.id);
    this.cdr.detectChanges();
  }

  onProductosActualizados(productos: Producto[]): void {
    this.productosCache = productos;
    this.tieneProductos = productos.length > 0;
    this.persistState(Date.now());
    this.cdr.detectChanges();
  }

  private applyCachedState(state: DetalleEventoState): void {
    this.evento = { ...state.evento };
    this.tiposBoleta = [...state.tiposBoleta];
    this.tieneProductos = state.tieneProductos;
    this.productosCache = [...state.productos];
    this.palcosDisponiblesPorTipo = new Map(
      Array.from(state.palcosDisponiblesPorTipo.entries()).map(([k, v]) => [k, [...v]]),
    );
    this.palcosCatalogoPorTipo = new Map(
      Array.from(state.palcosCatalogoPorTipo.entries()).map(([k, v]) => [k, [...v]]),
    );
    this.carritoCompraService.syncEvento(this.evento);
  }

  private persistState(lastUpdated: number): void {
    if (!this.currentEventoId || !this.evento) return;
    this.detalleEventoStateService.saveState(this.currentEventoId, {
      evento: this.evento,
      tiposBoleta: this.tiposBoleta,
      tieneProductos: this.tieneProductos,
      productos: this.productosCache,
      lugar: null,
      categoria: null,
      palcosDisponiblesPorTipo: this.palcosDisponiblesPorTipo,
      palcosCatalogoPorTipo: this.palcosCatalogoPorTipo,
      lastUpdated,
    });
  }

  private startSilentRefreshIndicator(): void {
    if (this.refreshIndicatorTimer) {
      clearTimeout(this.refreshIndicatorTimer);
    }
    this.refreshIndicatorTimer = setTimeout(() => {
      this.cdr.detectChanges();
    }, this.refreshIndicatorDelayMs);
  }

  private stopSilentRefreshIndicator(): void {
    if (this.refreshIndicatorTimer) {
      clearTimeout(this.refreshIndicatorTimer);
      this.refreshIndicatorTimer = null;
    }
  }

  private async cargarCatalogo(eventoId: number, options?: { background?: boolean }): Promise<void> {
    const background = options?.background ?? false;
    const hasVisibleData = !!this.evento && this.evento.id === eventoId;
    const silentRefreshMode = background || hasVisibleData;
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;

    if (offline && hasVisibleData) {
      this.loading = false;
      this.loadingBoletas = false;
      this.loadingProductosFlag = false;
      this.stopSilentRefreshIndicator();
      this.cdr.detectChanges();
      return;
    }

    this.loading = !silentRefreshMode && !hasVisibleData;
    this.loadingBoletas = !silentRefreshMode;
    this.loadingProductosFlag = !silentRefreshMode;

    if (silentRefreshMode) {
      this.startSilentRefreshIndicator();
    } else {
      this.stopSilentRefreshIndicator();
    }

    this.cdr.detectChanges();

    try {
      const evento = await this.eventosService.getEventoById(eventoId);
      this.evento = evento;
      this.carritoCompraService.syncEvento(evento);
      const finalizado = eventoCompraFinalizado(evento);

      const [tiposRaw, productos] = await Promise.all([
        finalizado
          ? Promise.resolve([] as TipoBoleta[])
          : this.boletasService.getTiposBoleta(eventoId).catch(() => [] as TipoBoleta[]),
        this.productosService
          .eventoTieneProductos(eventoId)
          .then(async (flag) => {
            if (!flag) return [] as Producto[];
            return this.productosService.getProductosPorEvento(eventoId).catch(() => [] as Producto[]);
          })
          .catch(() => [] as Producto[]),
      ]);

      this.tiposBoleta = normalizarTiposBoletaActivos(tiposRaw);
      this.loadingBoletas = false;
      await this.refrescarPalcosDisponibles();

      this.productosCache = productos || [];
      this.tieneProductos = this.productosCache.length > 0;
      this.loadingProductosFlag = false;

      this.aplicarRedirectCatalogo(eventoId);
      this.persistState(Date.now());
    } catch {
      if (!silentRefreshMode) {
        this.alertService.error('Error', 'No se pudo cargar el catálogo.');
        void this.router.navigate(['/carrito']);
      }
    } finally {
      this.loading = false;
      this.stopSilentRefreshIndicator();
      this.cdr.detectChanges();
    }
  }

  private aplicarRedirectCatalogo(eventoId: number): void {
    if (!this.catalogoCompraListo) return;

    const soloProductos = !this.tieneEntradasEnVenta && this.tieneProductos;
    const soloBoletas = this.tieneEntradasEnVenta && !this.tieneProductos;

    if (this.catalogoTipo === 'boletas' && soloProductos) {
      void this.router.navigate(['/carrito/agregar', eventoId, 'productos']);
      return;
    }
    if (this.catalogoTipo === 'productos' && soloBoletas) {
      void this.router.navigate(['/carrito/agregar', eventoId, 'boletas']);
    }
  }

  private async refrescarPalcosDisponibles(): Promise<void> {
    this.palcosDisponiblesPorTipo.clear();
    this.palcosCatalogoPorTipo.clear();
    for (const tipo of this.tiposBoleta) {
      if (!this.esLineaPalcoMultipersona(tipo)) continue;
      try {
        const [list, catalogo] = await Promise.all([
          this.boletasService.getPalcosDisponiblesParaVenta(tipo.id),
          this.boletasService.getPalcosPorTipo(tipo.id),
        ]);
        this.palcosDisponiblesPorTipo.set(tipo.id, list);
        this.palcosCatalogoPorTipo.set(tipo.id, catalogo || []);
      } catch {
        this.palcosDisponiblesPorTipo.set(tipo.id, []);
        this.palcosCatalogoPorTipo.set(tipo.id, []);
      }
    }
  }
}
