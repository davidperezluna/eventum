import { Component, OnInit, OnDestroy, ChangeDetectorRef, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, from } from 'rxjs';
import { takeUntil, debounceTime, switchMap, filter } from 'rxjs/operators';
import { ComprasService } from '../../services/compras.service';
import { BoletasService } from '../../services/boletas.service';
import { TrasladosBoletaService } from '../../services/traslados-boleta.service';
import { EventosService } from '../../services/eventos.service';
import { AuthService } from '../../services/auth.service';
import { AlertService } from '../../services/alert.service';
import { MisComprasStateService } from '../../services/mis-compras-state.service';
import { ComprasProductoService } from '../../services/compras-producto.service';
import {
  Compra,
  BoletaComprada,
  PaginatedResponse,
  TipoBoleta,
  Evento,
  TipoEstadoPago,
  TipoEstadoCompra,
  TrasladoBoleta,
  EstadoTrasladoBoleta,
  CompraProducto,
  CompraProductoItem,
  TipoEstadoItemProducto
} from '../../types';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import html2canvas from 'html2canvas';
import { DateFormatPipe } from '../../pipes/date-format.pipe';

interface BoletaConCompra {
  compra: Compra;
  boleta: BoletaComprada;
  esCedida?: boolean;
}

interface TipoBoletasGrupo {
  key: string;
  nombre: string;
  boletas: BoletaConCompra[];
  totalBoletas: number;
  totalDisponibles: number;
  totalTrasladoSaliente: number;
  totalUsadas: number;
  totalSinUsar: number;
  totalSinAsignar: number;
}

interface ProductoConCompra {
  compra: CompraProducto;
  item: CompraProductoItem;
}

interface CompraProductosDetalle {
  compra: CompraProducto;
  items: CompraProductoItem[];
}

interface EventoBoletasGrupo {
  key: string;
  titulo: string;
  fechaInicio?: Date | string;
  fechaFin?: Date | string;
  lugar?: any;
  tipos: TipoBoletasGrupo[];
  compras: Compra[];
  comprasProductos: CompraProducto[];
  totalCedidas: number;
  totalBoletas: number;
  totalDisponibles: number;
  totalTrasladoSaliente: number;
  totalUsadas: number;
  totalSinUsar: number;
  totalSinAsignar: number;
  totalItemsProducto: number;
  totalProductosComprados: number;
  totalProductosRedimidos: number;
}

@Component({
  selector: 'app-mis-compras',
  imports: [CommonModule, RouterModule, FormsModule, DateFormatPipe],
  templateUrl: './mis-compras.html',
  styleUrl: './mis-compras.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class MisCompras implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private loadComprasSubject = new Subject<void>();
  private refreshIndicatorTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly refreshIndicatorDelayMs = 800;
  private refreshStartedAt: number | null = null;
  private currentLoadBackground = false;
  
  compras: Compra[] = [];
  comprasProductos: CompraProducto[] = [];
  loadingComprasProductos = false;
  comprasConBoletas: { compra: Compra; boletas: BoletaComprada[] }[] = [];
  eventosConBoletas: EventoBoletasGrupo[] = [];
  eventoExpandidoKey: string | null = null;
  eventoDetalleKey: string | null = null;
  tabBoletasDetalle: 'sin-usar' | 'usadas' | 'sin-asignar' = 'sin-usar';
  tabEventoDetalle: 'entradas' | 'productos' = 'entradas';
  tabProductosDetalle: 'compradas' | 'redimidas' = 'compradas';
  loading = false;
  isRefreshing = false;
  loadingBoletasDetalle = true;
  total = 0;
  page = 1;
  limit = 1000;
  totalPages = 0;

  // Filtros
  estadoPagoFiltro: string | null = null;
  estadoCompraFiltro: string | null = null;
  eventoFiltro: number | null = null;
  fechaDesde: string = '';
  fechaHasta: string = '';
  searchTerm: string = '';
  mostrarFiltros = false;

  /** Lista principal `/mis-compras`: filtros ocultos temporalmente. */
  mostrarToolbarFiltrosMisCompras = false;

  // Lista de eventos disponibles (solo eventos donde el usuario tiene compras)
  eventosDisponibles: Evento[] = [];
  loadingEventos = false;

  estadosPago: { value: TipoEstadoPago; label: string }[] = [
    { value: TipoEstadoPago.PENDIENTE, label: 'Pendiente' },
    { value: TipoEstadoPago.COMPLETADO, label: 'Completado' },
    { value: TipoEstadoPago.FALLIDO, label: 'Fallido' },
    { value: TipoEstadoPago.REEMBOLSADO, label: 'Reembolsado' },
    { value: TipoEstadoPago.CANCELADO, label: 'Cancelado' }
  ];

  estadosCompra: { value: TipoEstadoCompra; label: string }[] = [
    { value: TipoEstadoCompra.PENDIENTE, label: 'Pendiente' },
    { value: TipoEstadoCompra.CONFIRMADA, label: 'Confirmada' },
    { value: TipoEstadoCompra.CANCELADA, label: 'Cancelada' },
    { value: TipoEstadoCompra.REEMBOLSADA, label: 'Reembolsada' }
  ];

  // Modal de vista previa de boleta
  showBoletaModal = false;
  boletaSeleccionada: BoletaComprada | null = null;
  compraSeleccionada: Compra | null = null;
  eventoSeleccionado: Evento | null = null;
  tipoBoletaSeleccionado: TipoBoleta | null = null;
  qrCodeUrl: string = '';
  loadingQR = false;
  showProductoQrModal = false;
  productoFilaSeleccionada: ProductoConCompra | null = null;
  productoQrCodeUrl = '';
  loadingProductoQR = false;

  /** Traslados de palcos: historial y mapas para ocultar QR al remitente con envío pendiente. */
  trasladosHistorial: TrasladoBoleta[] = [];
  trasladosPendientesRecibir: Array<TrasladoBoleta & { boletaDetail?: BoletaComprada }> = [];
  trasladoSalientePorBoletaId = new Map<number, TrasladoBoleta>();
  entradasCedidas: BoletaComprada[] = [];
  loadingTraslados = false;

  showTrasladoModal = false;
  trasladoBoleta: BoletaComprada | null = null;
  trasladoCompra: Compra | null = null;
  emailTrasladoDestino = '';
  enviandoTraslado = false;
  rellenarPerfilBoletaId: number | null = null;
  /** Error visible junto al panel de asignación (además del modal SweetAlert). */
  asignacionError: { boletaId: number; mensaje: string } | null = null;

  /** Ruta `/mis-compras/actividad`: solo trazabilidad de traslados. */
  vistaActividad = false;

  constructor(
    private comprasService: ComprasService,
    private comprasProductoService: ComprasProductoService,
    private boletasService: BoletasService,
    private trasladosBoletaService: TrasladosBoletaService,
    private eventosService: EventosService,
    private authService: AuthService,
    private alertService: AlertService,
    private misComprasStateService: MisComprasStateService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {}

  ngOnInit() {
    this.syncVistaActividadDesdeUrl(this.router.url);
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe((e) => this.syncVistaActividadDesdeUrl(e.urlAfterRedirects));

    const userId = this.authService.getUsuarioId();
    const cachedState = userId ? this.misComprasStateService.getState(userId) : null;
    if (cachedState) {
      this.applyCachedState(cachedState);
      this.loading = false;
    }

    // Configurar debounce para búsqueda
    this.loadComprasSubject.pipe(
      debounceTime(300),
      switchMap(() => from(this.loadComprasInternal())),
      takeUntil(this.destroy$)
    ).subscribe({
      next: async (response: PaginatedResponse<Compra>) => {
        this.compras = (response.data || []).filter(
          (compra) => compra.estado_pago === TipoEstadoPago.COMPLETADO
        );
        this.total = response.total || 0;
        this.totalPages = response.totalPages || 0;
        this.loadingBoletasDetalle = true;

        await this.loadBoletasPorCompra({ background: this.currentLoadBackground });
        await this.loadComprasProductos();

        this.loading = false;
        this.endSilentRefreshCycle();
        this.persistState(Date.now());
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando compras:', err);
        this.compras = [];
        this.comprasProductos = [];
        this.comprasConBoletas = [];
        this.eventosConBoletas = [];
        this.eventoExpandidoKey = null;
        this.total = 0;
        this.totalPages = 0;
        this.loading = false;
        this.loadingBoletasDetalle = false;
        this.endSilentRefreshCycle();
        this.cdr.detectChanges();
      }
    });

    this.loadEventosDisponibles(); // Cargar eventos disponibles
    this.loadCompras({ background: !!cachedState }); // Carga inicial
  }

  private syncVistaActividadDesdeUrl(url: string): void {
    const path = (url || '').split('?')[0];
    this.vistaActividad = path.endsWith('/mis-compras/actividad');
    const detalleMatch = path.match(/\/mis-compras\/evento\/([^/]+)$/);
    this.eventoDetalleKey = detalleMatch ? decodeURIComponent(detalleMatch[1]) : null;
    this.syncTabEventoDetalle();
    this.cdr.detectChanges();
  }

  loadCompras(options?: { background?: boolean; resetPage?: boolean }) {
    if (options?.resetPage !== false) {
      this.page = 1; // Resetear a primera página al filtrar
    }

    const hasVisibleData =
      this.compras.length > 0 ||
      this.comprasProductos.length > 0 ||
      this.eventosConBoletas.length > 0;
    const background = options?.background ?? hasVisibleData;
    this.currentLoadBackground = background;
    this.loading = !background && !hasVisibleData;
    this.loadingBoletasDetalle = true;
    if (background) {
      this.startSilentRefreshCycle();
    } else {
      this.endSilentRefreshCycle();
    }
    this.cdr.detectChanges();
    this.loadComprasSubject.next();
  }

  private async loadComprasProductos(): Promise<void> {
    const clienteId = this.authService.getUsuarioId();
    if (!clienteId) {
      this.comprasProductos = [];
      return;
    }

    this.loadingComprasProductos = true;
    try {
      const compras = await this.comprasProductoService.getComprasByCliente(clienteId);
      this.comprasProductos = compras.filter(
        (compra) => (compra.estado_pago || '').toLowerCase() === TipoEstadoPago.COMPLETADO
      );
    } catch (err) {
      console.error('Error cargando compras de productos:', err);
      this.comprasProductos = [];
    } finally {
      this.loadingComprasProductos = false;
      this.fusionarProductosEnEventos();
      this.syncTabEventoDetalle();
      this.cdr.detectChanges();
    }
  }

  eventoTieneEntradas(grupo: EventoBoletasGrupo | null | undefined): boolean {
    return (grupo?.totalBoletas ?? 0) > 0;
  }

  eventoTieneProductos(grupo: EventoBoletasGrupo | null | undefined): boolean {
    return (grupo?.totalItemsProducto ?? 0) > 0;
  }

  mostrarTabBoletas(
    grupo: EventoBoletasGrupo | null | undefined,
    tab: 'sin-usar' | 'sin-asignar' | 'usadas'
  ): boolean {
    if (!grupo) return false;
    if (tab === 'sin-usar') return (grupo.totalSinUsar ?? 0) > 0;
    if (tab === 'sin-asignar') return (grupo.totalSinAsignar ?? 0) > 0;
    return (grupo.totalUsadas ?? 0) > 0;
  }

  mostrarTabProductos(
    grupo: EventoBoletasGrupo | null | undefined,
    tab: 'compradas' | 'redimidas'
  ): boolean {
    if (!grupo) return false;
    if (tab === 'compradas') return (grupo.totalProductosComprados ?? 0) > 0;
    return (grupo.totalProductosRedimidos ?? 0) > 0;
  }

  private syncTabEventoDetalle(): void {
    const detalle = this.eventoDetalleBoletas();
    if (!detalle) {
      return;
    }
    if (!this.eventoTieneEntradas(detalle) && this.eventoTieneProductos(detalle)) {
      this.tabEventoDetalle = 'productos';
    } else if (!this.eventoTieneProductos(detalle)) {
      this.tabEventoDetalle = 'entradas';
    }
    this.normalizarTabBoletasDetalle(detalle);
    this.syncTabProductosDetalle();
  }

  private syncTabProductosDetalle(): void {
    const detalle = this.eventoDetalleBoletas();
    if (!detalle) {
      return;
    }
    this.normalizarTabProductosDetalle(detalle);
  }

  private normalizarTabBoletasDetalle(detalle: EventoBoletasGrupo): void {
    if (this.mostrarTabBoletas(detalle, this.tabBoletasDetalle)) return;
    if (this.mostrarTabBoletas(detalle, 'sin-usar')) {
      this.tabBoletasDetalle = 'sin-usar';
      return;
    }
    if (this.mostrarTabBoletas(detalle, 'sin-asignar')) {
      this.tabBoletasDetalle = 'sin-asignar';
      return;
    }
    this.tabBoletasDetalle = 'usadas';
  }

  private normalizarTabProductosDetalle(detalle: EventoBoletasGrupo): void {
    if (this.mostrarTabProductos(detalle, this.tabProductosDetalle)) return;
    if (this.mostrarTabProductos(detalle, 'compradas')) {
      this.tabProductosDetalle = 'compradas';
      return;
    }
    this.tabProductosDetalle = 'redimidas';
  }

  esProductoComprado(item: CompraProductoItem): boolean {
    const estado = (item.estado || TipoEstadoItemProducto.PENDIENTE).toLowerCase();
    return (
      estado === TipoEstadoItemProducto.CONFIRMADO ||
      estado === TipoEstadoItemProducto.PENDIENTE
    );
  }

  esProductoRedimido(item: CompraProductoItem): boolean {
    return (item.estado || '').toLowerCase() === TipoEstadoItemProducto.ENTREGADO;
  }

  productosDetallePorTab(grupo: EventoBoletasGrupo): ProductoConCompra[] {
    const filas: ProductoConCompra[] = [];
    for (const compra of grupo.comprasProductos || []) {
      for (const item of compra.compras_productos_items || []) {
        const incluir =
          (this.tabProductosDetalle === 'compradas' && this.esProductoComprado(item)) ||
          (this.tabProductosDetalle === 'redimidas' && this.esProductoRedimido(item));
        if (incluir) {
          filas.push({ compra, item });
        }
      }
    }
    return filas;
  }

  itemsCompraPorTab(compra: CompraProducto, grupo: EventoBoletasGrupo): CompraProductoItem[] {
    const filas = this.productosDetallePorTab(grupo).filter((f) => f.compra.id === compra.id);
    return filas.map((f) => f.item);
  }

  comprasProductosDetallePorTab(grupo: EventoBoletasGrupo): CompraProductosDetalle[] {
    const filas = this.productosDetallePorTab(grupo);
    const map = new Map<number, CompraProductosDetalle>();

    for (const fila of filas) {
      let entry = map.get(fila.compra.id);
      if (!entry) {
        entry = { compra: fila.compra, items: [] };
        map.set(fila.compra.id, entry);
      }
      entry.items.push(fila.item);
    }

    return Array.from(map.values());
  }

  totalItemsCompraProductos(items: CompraProductoItem[]): number {
    return (items || []).reduce(
      (sum, item) => sum + Number(item.subtotal_linea ?? (item.cantidad || 0) * (item.precio_unitario || 0)),
      0
    );
  }

  totalUnidadesCompraProductos(items: CompraProductoItem[]): number {
    return (items || []).reduce((sum, item) => sum + Number(item.cantidad || 0), 0);
  }

  detalleProductosCompra(compra: CompraProducto | null | undefined): Array<{ nombre: string; cantidad: number }> {
    if (!compra) return [];
    const items = compra.compras_productos_items || [];
    const map = new Map<string, { nombre: string; cantidad: number }>();

    for (const item of items) {
      const nombre = (item.productos?.nombre || 'Producto').trim();
      const key = String(item.producto_id ?? nombre).trim();
      const actual = map.get(key);
      if (actual) {
        actual.cantidad += Number(item.cantidad || 0);
      } else {
        map.set(key, { nombre, cantidad: Number(item.cantidad || 0) });
      }
    }

    return Array.from(map.values());
  }

  referenciaPedidoCorta(numeroPedido?: string): string {
    const numero = (numeroPedido || '').trim();
    if (!numero) {
      return '—';
    }
    if (numero.length <= 18) {
      return numero;
    }
    return `…${numero.slice(-10)}`;
  }

  getEstadoProductoLabel(item: CompraProductoItem): string {
    if (this.esProductoRedimido(item)) {
      return 'Redimido';
    }
    if (this.esProductoComprado(item)) {
      return 'Por retirar';
    }
    const estados: Record<string, string> = {
      [TipoEstadoItemProducto.CANCELADO]: 'Cancelado',
      [TipoEstadoItemProducto.PENDIENTE]: 'Pendiente',
      [TipoEstadoItemProducto.CONFIRMADO]: 'Por retirar',
      [TipoEstadoItemProducto.ENTREGADO]: 'Redimido'
    };
    return estados[(item.estado || '').toLowerCase()] || item.estado || 'Pendiente';
  }

  getEstadoProductoClass(item: CompraProductoItem): string {
    if (this.esProductoRedimido(item)) {
      return 'badge-warning';
    }
    if (this.esProductoComprado(item)) {
      return 'badge-success';
    }
    if ((item.estado || '').toLowerCase() === TipoEstadoItemProducto.CANCELADO) {
      return 'badge-danger';
    }
    return 'badge-info';
  }

  esDiaEventoGrupo(grupo: EventoBoletasGrupo | null | undefined): boolean {
    if (!grupo?.fechaInicio) return true;
    const inicio = new Date(grupo.fechaInicio);
    if (Number.isNaN(inicio.getTime())) return true;
    const fin = grupo.fechaFin ? new Date(grupo.fechaFin) : inicio;
    if (Number.isNaN(fin.getTime())) return true;
    const hoy = this.diaCalendarioLocal(new Date());
    const desde = Math.min(this.diaCalendarioLocal(inicio), this.diaCalendarioLocal(fin));
    const hasta = Math.max(this.diaCalendarioLocal(inicio), this.diaCalendarioLocal(fin));
    return hoy >= desde && hoy <= hasta;
  }

  private formatFechaHabilitacionAmigable(fecha: Date): string {
    return new Intl.DateTimeFormat('es-CO', {
      weekday: 'short',
      day: '2-digit',
      month: 'long',
    }).format(fecha);
  }

  mensajeHabilitacionQrProducto(grupo: EventoBoletasGrupo | null | undefined): string {
    if (!grupo?.fechaInicio) {
      return 'El QR de este producto estará disponible el día del evento.';
    }
    const inicio = new Date(grupo.fechaInicio);
    if (Number.isNaN(inicio.getTime())) {
      return 'El QR de este producto estará disponible el día del evento.';
    }
    return `El código QR se habilita el ${this.formatFechaHabilitacionAmigable(inicio)}.`;
  }

  mensajeEstadoQrProducto(fila: ProductoConCompra, grupo: EventoBoletasGrupo | null | undefined): string {
    if (!this.productoTieneCodigoQR(fila)) {
      return 'Estamos preparando el QR del pedido. Vuelve a intentar en unos segundos.';
    }
    if ((fila.compra.estado_pago || '').toLowerCase() !== TipoEstadoPago.COMPLETADO) {
      return 'El código QR estará disponible cuando se confirme el pago.';
    }
    if (!this.esProductoComprado(fila.item)) {
      return 'Este item ya fue redimido.';
    }
    if (this.esDiaEventoGrupo(grupo)) {
      return 'QR disponible para retiro.';
    }
    return this.mensajeHabilitacionQrProducto(grupo);
  }

  etiquetaQrProducto(grupo: EventoBoletasGrupo | null | undefined): string {
    if (this.esDiaEventoGrupo(grupo)) {
      return 'QR disponible para retiro';
    }
    if (!grupo?.fechaInicio) {
      return 'QR disponible el día del evento';
    }
    const inicio = new Date(grupo.fechaInicio);
    if (Number.isNaN(inicio.getTime())) {
      return 'QR disponible el día del evento';
    }
    return `Disponible desde ${this.formatFechaHabilitacionAmigable(inicio)}`;
  }

  puedeAbrirQrProducto(fila: ProductoConCompra, grupo: EventoBoletasGrupo): boolean {
    return (
      this.productoTieneCodigoQR(fila) &&
      fila.compra.estado_pago === TipoEstadoPago.COMPLETADO &&
      this.esProductoComprado(fila.item)
    );
  }

  puedeMostrarQrProducto(fila: ProductoConCompra, grupo: EventoBoletasGrupo): boolean {
    return this.puedeAbrirQrProducto(fila, grupo) && this.esDiaEventoGrupo(grupo);
  }

  async verQrProducto(fila: ProductoConCompra, grupo: EventoBoletasGrupo): Promise<void> {
    if (!this.esProductoComprado(fila.item) || fila.compra.estado_pago !== TipoEstadoPago.COMPLETADO) return;
    if (!this.productoTieneCodigoQR(fila)) {
      this.alertService.warning(
        'QR en preparación',
        'Este pedido aún no tiene código QR asignado. Recarga en unos segundos o vuelve a intentarlo.'
      );
      return;
    }
    this.productoFilaSeleccionada = fila;
    this.productoQrCodeUrl = '';
    this.showProductoQrModal = true;
    this.loadingProductoQR = this.puedeMostrarQrProducto(fila, grupo);
    this.cdr.detectChanges();

    const codigoPedido = this.getCodigoQrCompraProducto(fila.compra);
    if (!this.loadingProductoQR || !codigoPedido) return;
    try {
      this.productoQrCodeUrl = await QRCode.toDataURL(codigoPedido, {
        width: 200,
        margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' }
      });
    } catch (err) {
      console.error('Error generando QR de producto:', err);
      this.productoQrCodeUrl = '';
    } finally {
      this.loadingProductoQR = false;
      this.cdr.detectChanges();
    }
  }

  cerrarProductoQrModal(): void {
    this.showProductoQrModal = false;
    this.productoFilaSeleccionada = null;
    this.productoQrCodeUrl = '';
    this.loadingProductoQR = false;
    this.cdr.detectChanges();
  }

  productoTieneCodigoQR(fila: ProductoConCompra): boolean {
    return this.getCodigoQrCompraProducto(fila.compra) !== null;
  }

  getCodigoQrCompraProducto(compra: CompraProducto | null | undefined): string | null {
    const numeroPedido = String(compra?.numero_pedido || '').trim();
    if (!numeroPedido) return null;
    return `PROD-ORD-${numeroPedido}`;
  }

  esPrimerItemPedidoEnTab(fila: ProductoConCompra, grupo: EventoBoletasGrupo): boolean {
    const filas = this.productosDetallePorTab(grupo);
    const primeraFila = filas.find((x) => x.compra.id === fila.compra.id);
    return !!primeraFila && primeraFila.item.id === fila.item.id;
  }

  private filaRepresentativaCompra(compra: CompraProducto, grupo: EventoBoletasGrupo): ProductoConCompra | null {
    const fila = this.productosDetallePorTab(grupo).find((x) => x.compra.id === compra.id);
    if (!fila) return null;
    return fila;
  }

  compraTieneCodigoQR(compra: CompraProducto): boolean {
    return this.getCodigoQrCompraProducto(compra) !== null;
  }

  puedeMostrarQrCompraProducto(compra: CompraProducto, grupo: EventoBoletasGrupo): boolean {
    const fila = this.filaRepresentativaCompra(compra, grupo);
    if (!fila) return false;
    return this.puedeMostrarQrProducto(fila, grupo);
  }

  mensajeEstadoQrCompraProducto(compra: CompraProducto, grupo: EventoBoletasGrupo): string {
    const fila = this.filaRepresentativaCompra(compra, grupo);
    if (!fila) return 'No hay items de este pedido en el estado actual.';
    return this.mensajeEstadoQrProducto(fila, grupo);
  }

  async verQrCompraProducto(compra: CompraProducto, grupo: EventoBoletasGrupo): Promise<void> {
    const fila = this.filaRepresentativaCompra(compra, grupo);
    if (!fila) return;
    await this.verQrProducto(fila, grupo);
  }

  getPrecioPreventaProductoDetalle(fila: ProductoConCompra): number {
    const precioCatalogo = Number(fila.item.productos?.precio);
    if (Number.isFinite(precioCatalogo) && precioCatalogo >= 0) {
      return precioCatalogo;
    }
    return Number(fila.item.precio_unitario || 0);
  }

  getPrecioEventoProductoDetalle(fila: ProductoConCompra): number {
    const precioEventoCatalogo = Number(fila.item.productos?.precio_evento);
    if (Number.isFinite(precioEventoCatalogo) && precioEventoCatalogo >= 0) {
      return precioEventoCatalogo;
    }
    return this.getPrecioPreventaProductoDetalle(fila);
  }

  tienePrecioDiferenciadoProductoDetalle(fila: ProductoConCompra): boolean {
    return this.getPrecioEventoProductoDetalle(fila) !== this.getPrecioPreventaProductoDetalle(fila);
  }

  getPrecioReferenciaProductoDetalle(fila: ProductoConCompra): number {
    const pagado = Number(fila.item.precio_unitario || 0);
    const preventa = this.getPrecioPreventaProductoDetalle(fila);
    const evento = this.getPrecioEventoProductoDetalle(fila);

    if (!this.tienePrecioDiferenciadoProductoDetalle(fila)) return pagado;
    if (Math.abs(pagado - preventa) < 0.01) return evento;
    if (Math.abs(pagado - evento) < 0.01) return preventa;
    return Math.max(preventa, evento);
  }

  getAhorroProductoDetalle(fila: ProductoConCompra): number {
    const pagado = Number(fila.item.precio_unitario || 0);
    const referencia = this.getPrecioReferenciaProductoDetalle(fila);
    const ahorro = referencia - pagado;
    return ahorro > 0 ? ahorro : 0;
  }

  getEstadoPrecioProductoDetalleLabel(fila: ProductoConCompra): string {
    const pagado = Number(fila.item.precio_unitario || 0);
    const preventa = this.getPrecioPreventaProductoDetalle(fila);
    const evento = this.getPrecioEventoProductoDetalle(fila);

    if (Math.abs(pagado - preventa) < 0.01) return 'Compraste en preventa';
    if (Math.abs(pagado - evento) < 0.01) return 'Compraste en evento';
    return 'Precio aplicado';
  }

  private recalcularContadoresProducto(grupo: EventoBoletasGrupo): void {
    let comprados = 0;
    let redimidos = 0;

    for (const compra of grupo.comprasProductos || []) {
      for (const item of compra.compras_productos_items || []) {
        const cantidad = item.cantidad || 0;
        if (this.esProductoRedimido(item)) {
          redimidos += cantidad;
        } else if (this.esProductoComprado(item)) {
          comprados += cantidad;
        }
      }
    }

    grupo.totalProductosComprados = comprados;
    grupo.totalProductosRedimidos = redimidos;
    grupo.totalItemsProducto = comprados + redimidos;
  }

  private fusionarProductosEnEventos(): void {
    for (const grupo of this.eventosConBoletas) {
      grupo.comprasProductos = [];
      grupo.totalItemsProducto = 0;
      grupo.totalProductosComprados = 0;
      grupo.totalProductosRedimidos = 0;
    }

    for (const compra of this.comprasProductos) {
      const eventoKey = String(compra.evento_id);
      let grupo = this.eventosConBoletas.find((g) => g.key === eventoKey);

      if (!grupo) {
        grupo = {
          key: eventoKey,
          titulo: compra.eventos?.titulo || 'Evento',
          fechaInicio: compra.eventos?.fecha_inicio,
          fechaFin: compra.eventos?.fecha_fin,
          lugar: compra.eventos?.lugar,
          tipos: [],
          compras: [],
          comprasProductos: [],
          totalCedidas: 0,
          totalBoletas: 0,
          totalDisponibles: 0,
          totalTrasladoSaliente: 0,
          totalUsadas: 0,
          totalSinUsar: 0,
          totalSinAsignar: 0,
          totalItemsProducto: 0,
          totalProductosComprados: 0,
          totalProductosRedimidos: 0
        };
        this.eventosConBoletas.push(grupo);
      }

      grupo.comprasProductos.push(compra);
    }

    for (const grupo of this.eventosConBoletas) {
      this.recalcularContadoresProducto(grupo);
    }

    this.eventosConBoletas = this.eventosConBoletas
      .filter(
        (grupo) =>
          grupo.totalBoletas > 0 ||
          grupo.totalItemsProducto > 0 ||
          grupo.totalCedidas > 0
      )
      .sort((a, b) => {
        const fechaA = a.fechaInicio ? new Date(a.fechaInicio).getTime() : 0;
        const fechaB = b.fechaInicio ? new Date(b.fechaInicio).getTime() : 0;
        if (fechaA !== fechaB) return fechaB - fechaA;
        return a.titulo.localeCompare(b.titulo);
      });
  }

  totalItemsProducto(compra: CompraProducto): number {
    return (compra.compras_productos_items || []).reduce(
      (sum, item) => sum + (item.cantidad || 0),
      0
    );
  }

  private async loadComprasInternal(): Promise<PaginatedResponse<Compra>> {
    const clienteId = this.authService.getUsuarioId();
    if (!clienteId) {
      console.error('No se pudo identificar el cliente');
      return { data: [], total: 0, page: 1, limit: this.limit, totalPages: 0 };
    }

    if (this.isOffline() && this.compras.length > 0) {
      console.info('[MisCompras] Sin conexión, usando compras cacheadas');
      return {
        data: this.compras.filter((compra) => compra.estado_pago === TipoEstadoPago.COMPLETADO),
        total: this.total || this.compras.length,
        page: this.page,
        limit: this.limit,
        totalPages: this.totalPages || Math.max(1, Math.ceil((this.total || this.compras.length) / this.limit))
      };
    }

    const filters: any = {
      cliente_id: clienteId,
      page: this.page,
      limit: this.limit,
      estado_pago: TipoEstadoPago.COMPLETADO,
    };

    // Aplicar filtros adicionales
    if (this.estadoCompraFiltro) {
      filters.estado_compra = this.estadoCompraFiltro;
    }
    if (this.fechaDesde) {
      filters.fecha_desde = this.fechaDesde;
    }
    if (this.fechaHasta) {
      filters.fecha_hasta = this.fechaHasta;
    }
    if (this.searchTerm) {
      // Buscar por número de transacción
      filters.search = this.searchTerm;
    }
    if (this.eventoFiltro) {
      filters.evento_id = this.eventoFiltro;
    }

    try {
      return await this.comprasService.getCompras(filters);
    } catch (err) {
      console.error('Error en loadComprasInternal:', err);
      return { data: [], total: 0, page: 1, limit: this.limit, totalPages: 0 };
    }
  }

  limpiarFiltros() {
    this.estadoPagoFiltro = null;
    this.estadoCompraFiltro = null;
    this.eventoFiltro = null;
    this.fechaDesde = '';
    this.fechaHasta = '';
    this.searchTerm = '';
    this.loadCompras();
  }

  aplicarFiltros() {
    this.loadCompras();
    this.mostrarFiltros = false;
  }

  toggleFiltros() {
    this.mostrarFiltros = !this.mostrarFiltros;
    this.cdr.detectChanges();
  }

  /**
   * Carga los eventos únicos donde el usuario tiene compras
   */
  loadEventosDisponibles() {
    const clienteId = this.authService.getUsuarioId();
    if (!clienteId) {
      return;
    }

    this.loadingEventos = true;
    
    // Obtener todas las compras del usuario (sin paginación para obtener todos los eventos)
    this.loadEventosDisponiblesInternal(clienteId);
  }

  private async loadEventosDisponiblesInternal(clienteId: number) {
    try {
      const response: PaginatedResponse<Compra> = await this.comprasService.getCompras({
        cliente_id: clienteId,
        estado_pago: TipoEstadoPago.COMPLETADO,
        limit: 1000 // Límite alto para obtener todas las compras
      });
      
      // Extraer evento_id únicos
      const eventoIds = new Set<number>();
      response.data.forEach(compra => {
        if (compra.evento_id) {
          eventoIds.add(compra.evento_id);
        }
      });

      // Cargar información de los eventos
      if (eventoIds.size > 0) {
        const eventoIdsArray = Array.from(eventoIds);
        const eventosPromises = eventoIdsArray.map(async (eventoId) => {
          try {
            return await this.eventosService.getEventoById(eventoId);
          } catch {
            return null;
          }
        });

        // Usar Promise.all para cargar todos los eventos en paralelo
        const eventos = await Promise.all(eventosPromises);
        this.eventosDisponibles = eventos.filter((e): e is Evento => e !== null)
          .sort((a, b) => {
            // Ordenar por título
            return a.titulo.localeCompare(b.titulo);
          });
        this.loadingEventos = false;
        this.cdr.detectChanges();
      } else {
        this.eventosDisponibles = [];
        this.loadingEventos = false;
        this.cdr.detectChanges();
      }
    } catch (err) {
      console.error('Error cargando compras para eventos:', err);
      this.loadingEventos = false;
      this.cdr.detectChanges();
    }
  }

  goToPage(pageNum: number) {
    if (pageNum >= 1 && pageNum <= this.totalPages) {
      this.page = pageNum;
      this.loadCompras({ resetPage: false, background: true });
    }
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPages = 5; // Mostrar máximo 5 números de página
    let startPage = Math.max(1, this.page - Math.floor(maxPages / 2));
    let endPage = Math.min(this.totalPages, startPage + maxPages - 1);

    if (endPage - startPage < maxPages - 1) {
      startPage = Math.max(1, endPage - maxPages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  }

  private async refrescarTrasladosMaps(): Promise<void> {
    const uid = this.authService.getUsuarioId();
    if (!uid) {
      this.trasladosHistorial = [];
      this.trasladosPendientesRecibir = [];
      this.trasladoSalientePorBoletaId.clear();
      return;
    }
    this.loadingTraslados = true;
    try {
      this.trasladosHistorial = await this.trasladosBoletaService.listarMiTrazabilidad();
      this.trasladoSalientePorBoletaId.clear();
      for (const t of this.trasladosHistorial) {
        const e = String(t.estado);
        if (
          t.usuario_origen_id === uid &&
          (e === EstadoTrasladoBoleta.ENVIADO || e === EstadoTrasladoBoleta.RECIBIDO)
        ) {
          this.trasladoSalientePorBoletaId.set(t.boleta_id, t);
        }
      }
      const pend = this.trasladosHistorial.filter((t) => {
        const e = String(t.estado);
        return (
          t.usuario_destino_id === uid &&
          (e === EstadoTrasladoBoleta.ENVIADO || e === EstadoTrasladoBoleta.RECIBIDO)
        );
      });
      const ids = pend.map((p) => p.boleta_id);
      const detMap = new Map<number, BoletaComprada>();
      if (ids.length) {
        const det = await this.boletasService.getBoletasByIds(ids);
        det.forEach((b) => detMap.set(b.id, b));
      }
      this.trasladosPendientesRecibir = pend.map((t) => ({
        ...t,
        boletaDetail: detMap.get(t.boleta_id)
      }));
    } catch (e) {
      console.error('Error cargando traslados:', e);
      this.trasladosHistorial = [];
      this.trasladosPendientesRecibir = [];
      this.trasladoSalientePorBoletaId.clear();
    } finally {
      this.loadingTraslados = false;
    }
  }

  async loadBoletasPorCompra(options?: { background?: boolean }) {
    const background = options?.background ?? false;
    this.loadingBoletasDetalle = true;
    this.cdr.detectChanges();

    if (!background) {
      this.comprasConBoletas = [];
      this.eventosConBoletas = [];
      this.eventoExpandidoKey = null;
    }
    const uid = this.authService.getUsuarioId();
    if (!uid) {
      this.entradasCedidas = [];
      this.loadingBoletasDetalle = false;
      return;
    }

    if (this.isOffline() && (this.comprasConBoletas.length > 0 || this.eventosConBoletas.length > 0)) {
      console.info('[MisCompras] Sin conexión, usando boletas cacheadas');
      this.loadingBoletasDetalle = false;
      this.cdr.detectChanges();
      return;
    }

    try {
      await this.refrescarTrasladosMaps();
      const nextComprasConBoletas: { compra: Compra; boletas: BoletaComprada[] }[] = [];

      for (const compra of this.compras) {
        if (compra.estado_pago !== TipoEstadoPago.COMPLETADO) {
          continue;
        }
        try {
          const response = await this.boletasService.getBoletasCompradas({
            compra_id: compra.id,
            limit: 1000
          });
          const boletas = response.data || [];
          const visibles = boletas.filter(
            (b) => this.esTitularBoleta(b, compra) && !this.esBoletaCancelada(b)
          );
          if (visibles.length === 0) {
            continue;
          }
          nextComprasConBoletas.push({
            compra,
            boletas: visibles
          });
        } catch (err) {
          console.error('Error cargando boletas para compra:', compra.id, err);
        }
      }
      this.comprasConBoletas = nextComprasConBoletas;

      try {
        this.entradasCedidas = (await this.boletasService.getBoletasCedidasTitular(uid))
          .filter(
            (b) =>
              !this.esBoletaCancelada(b) &&
              b.compra?.estado_pago === TipoEstadoPago.COMPLETADO
          );
      } catch (e) {
        console.error('Error cargando entradas cedidas:', e);
        this.entradasCedidas = [];
      }

      this.reconstruirEventosConBoletas();
    } finally {
      this.loadingBoletasDetalle = false;
      this.cdr.detectChanges();
    }
  }

  private reconstruirEventosConBoletas(): void {
    const eventosMap = new Map<string, EventoBoletasGrupo>();

    const agregarBoleta = (compra: Compra, boleta: BoletaComprada, esCedida = false): void => {
      const evento = this.eventoVistaBoleta(boleta, compra);
      const eventoId = evento?.id ?? compra.evento_id ?? `compra-${compra.id}`;
      const eventoKey = String(eventoId);
      let grupoEvento = eventosMap.get(eventoKey);

      if (!grupoEvento) {
        grupoEvento = {
          key: eventoKey,
          titulo: evento?.titulo || compra.evento?.titulo || 'Evento',
          fechaInicio: evento?.fecha_inicio || compra.evento?.fecha_inicio,
          fechaFin: this.fechaFinEvento(evento),
          lugar: evento?.lugar || compra.evento?.lugar,
          tipos: [],
          compras: [],
          comprasProductos: [],
          totalCedidas: 0,
          totalBoletas: 0,
          totalDisponibles: 0,
          totalTrasladoSaliente: 0,
          totalUsadas: 0,
          totalSinUsar: 0,
          totalSinAsignar: 0,
          totalItemsProducto: 0,
          totalProductosComprados: 0,
          totalProductosRedimidos: 0
        };
        eventosMap.set(eventoKey, grupoEvento);
      }

      if (!esCedida && !grupoEvento.compras.some((c) => c.id === compra.id)) {
        grupoEvento.compras.push(compra);
      }

      if (esCedida) {
        grupoEvento.totalCedidas += 1;
      }

      const tipoNombre = boleta.tipo_boleta_meta?.nombre || 'Boleta';
      const tipoKey = `${boleta.tipo_boleta_id || 'sin-tipo'}-${tipoNombre}`;
      let grupoTipo = grupoEvento.tipos.find((tipo) => tipo.key === tipoKey);

      if (!grupoTipo) {
        grupoTipo = {
          key: tipoKey,
          nombre: tipoNombre,
          boletas: [],
          totalBoletas: 0,
          totalDisponibles: 0,
          totalTrasladoSaliente: 0,
          totalUsadas: 0,
          totalSinUsar: 0,
          totalSinAsignar: 0
        };
        grupoEvento.tipos.push(grupoTipo);
      }

      const estaEnTraslado = this.tieneTrasladoSalienteActivo(boleta.id);
      const estaUsada = this.esBoletaUsada(boleta);
      const estaAsignada = this.tieneAsistenteRegistrado(boleta);
      grupoTipo.boletas.push({ compra, boleta, esCedida });
      grupoTipo.totalBoletas += 1;
      grupoEvento.totalBoletas += 1;
      if (estaUsada) {
        grupoTipo.totalUsadas += 1;
        grupoEvento.totalUsadas += 1;
      } else if (!estaAsignada) {
        grupoTipo.totalSinAsignar += 1;
        grupoEvento.totalSinAsignar += 1;
      } else {
        grupoTipo.totalSinUsar += 1;
        grupoEvento.totalSinUsar += 1;
      }

      if (estaEnTraslado) {
        grupoTipo.totalTrasladoSaliente += 1;
        grupoEvento.totalTrasladoSaliente += 1;
      } else {
        grupoTipo.totalDisponibles += 1;
        grupoEvento.totalDisponibles += 1;
      }
    };

    for (const item of this.comprasConBoletas) {
      for (const boleta of item.boletas) {
        if (this.esBoletaCancelada(boleta)) {
          continue;
        }
        agregarBoleta(item.compra, boleta);
      }
    }

    for (const boleta of this.entradasCedidas) {
      if (this.esBoletaCancelada(boleta)) {
        continue;
      }
      agregarBoleta(this.compraVistaParaBoletaCedida(boleta), boleta, true);
    }

    this.eventosConBoletas = Array.from(eventosMap.values())
      .map((grupo) => ({
        ...grupo,
        comprasProductos: grupo.comprasProductos ?? [],
        totalItemsProducto: grupo.totalItemsProducto ?? 0,
        totalProductosComprados: grupo.totalProductosComprados ?? 0,
        totalProductosRedimidos: grupo.totalProductosRedimidos ?? 0,
        tipos: grupo.tipos.sort((a, b) => a.nombre.localeCompare(b.nombre))
      }))
      .sort((a, b) => {
        const fechaA = a.fechaInicio ? new Date(a.fechaInicio).getTime() : 0;
        const fechaB = b.fechaInicio ? new Date(b.fechaInicio).getTime() : 0;
        if (fechaA !== fechaB) return fechaB - fechaA;
        return a.titulo.localeCompare(b.titulo);
      });

    this.fusionarProductosEnEventos();
  }

  esTitularBoleta(b: BoletaComprada, compra: Compra): boolean {
    const uid = this.authService.getUsuarioId();
    if (!uid) return false;
    const titular = b.titular_cliente_id ?? compra.cliente_id;
    return titular === uid;
  }

  tieneTrasladoSalienteActivo(boletaId: number): boolean {
    return this.trasladoSalientePorBoletaId.has(boletaId);
  }

  /**
   * Boletas que siguen contándose como “tuyas” en el listado: excluye las que enviaste
   * por correo con traslado pendiente (aún eres titular pero no disponibles como el resto).
   */
  conteoBoletasDisponiblesEnFeed(boletas: BoletaComprada[]): number {
    return boletas.filter((b) => !this.tieneTrasladoSalienteActivo(b.id)).length;
  }

  conteoBoletasConTrasladoSaliente(boletas: BoletaComprada[]): number {
    return boletas.filter((b) => this.tieneTrasladoSalienteActivo(b.id)).length;
  }

  esBoletaTipoPalco(boleta: BoletaComprada): boolean {
    if (boleta.numero_palco != null) return true;
    return Boolean(boleta.tipo_boleta_meta?.es_palco);
  }

  tituloColeccionBoletas(boletas: BoletaComprada[]): string {
    return boletas.some((b) => this.esBoletaTipoPalco(b)) ? 'Boletas y palcos' : 'Boletas';
  }

  toggleEventoBoletas(eventoKey: string): void {
    this.eventoExpandidoKey = this.eventoExpandidoKey === eventoKey ? null : eventoKey;
    this.cdr.detectChanges();
  }

  isEventoBoletasExpandido(eventoKey: string): boolean {
    return this.eventoExpandidoKey === eventoKey;
  }

  abrirDetalleEventoBoletas(eventoKey: string): void {
    const grupo = this.eventosConBoletas.find((g) => g.key === eventoKey);
    if (grupo && !this.eventoTieneEntradas(grupo) && this.eventoTieneProductos(grupo)) {
      this.tabEventoDetalle = 'productos';
    } else {
      this.tabEventoDetalle = 'entradas';
    }
    this.syncTabProductosDetalle();
    this.router.navigate(['/mis-compras/evento', eventoKey]);
  }

  volverAMisCompras(): void {
    this.router.navigate(['/mis-compras']);
  }

  eventoDetalleBoletas(): EventoBoletasGrupo | null {
    if (!this.eventoDetalleKey) return null;
    return this.eventosConBoletas.find((grupo) => grupo.key === this.eventoDetalleKey) || null;
  }

  resumenDetalleEvento(grupo: EventoBoletasGrupo): string {
    const partes: string[] = [];
    if (grupo.totalBoletas > 0) {
      partes.push(`${grupo.totalBoletas} entrada${grupo.totalBoletas === 1 ? '' : 's'}`);
    }
    if (grupo.totalItemsProducto > 0) {
      partes.push(`${grupo.totalItemsProducto} producto${grupo.totalItemsProducto === 1 ? '' : 's'}`);
    }
    if (grupo.totalCedidas > 0) {
      partes.push(`${grupo.totalCedidas} recibida${grupo.totalCedidas === 1 ? '' : 's'}`);
    }
    return partes.join(' · ');
  }

  /** Tipos con nombre y cantidad > 0 para badges de resumen (sin fila genérica «N tipos»). */
  tiposResumenParaBadges(grupo: EventoBoletasGrupo | null | undefined): TipoBoletasGrupo[] {
    if (!grupo?.tipos?.length) return [];
    return grupo.tipos.filter((t) => {
      if ((t.totalBoletas ?? 0) <= 0) return false;
      if (!(t.nombre || '').trim()) return false;
      // Sin tipo en backend: agrupamos bajo prefijo sin id de tipo.
      if (t.key.startsWith('sin-tipo-')) return false;
      return true;
    });
  }

  tiposDetallePorTab(grupo: EventoBoletasGrupo | null): TipoBoletasGrupo[] {
    if (!grupo) return [];
    return grupo.tipos
      .map((tipo) => ({
        ...tipo,
        boletas: tipo.boletas.filter((item) => {
          const usada = this.esBoletaUsada(item.boleta);
          const asignada = this.tieneAsistenteRegistrado(item.boleta);
          if (this.tabBoletasDetalle === 'usadas') return usada;
          if (this.tabBoletasDetalle === 'sin-asignar') return !usada && !asignada;
          return !usada && asignada;
        })
      }))
      .filter((tipo) => tipo.boletas.length > 0);
  }

  // Algunos objetos evento enriquecidos pueden traer `fecha_fin` aunque el tipo no lo declare.
  fechaFinEvento(evento: any): any {
    return evento?.fecha_fin;
  }

  eventoVistaBoleta(boleta: BoletaComprada | null | undefined, compra?: Compra | null): any {
    return (boleta as any)?.evento || compra?.evento || null;
  }

  lugarVistaBoleta(boleta: BoletaComprada | null | undefined, compra?: Compra | null): any {
    return this.eventoVistaBoleta(boleta, compra)?.lugar || null;
  }

  private tipoBoletaVistaBoleta(boleta: BoletaComprada): TipoBoleta | null {
    const meta = boleta.tipo_boleta_meta;
    if (!meta?.nombre) return null;
    return {
      id: boleta.tipo_boleta_id,
      evento_id: this.eventoVistaBoleta(boleta)?.id || 0,
      nombre: meta.nombre,
      precio: boleta.precio_unitario || 0,
      cantidad_total: 0,
      cantidad_disponibles: 0,
      personas_por_unidad: meta.personas_por_unidad,
      es_palco: meta.es_palco,
    };
  }

  /** Fecha de creación más reciente entre boletas recibidas (subtítulo tipo “compra”). */
  fechaMasRecienteEntradasCedidas(): string | Date | null {
    let best = 0;
    let value: string | Date | null = null;
    for (const b of this.entradasCedidas) {
      if (!b.fecha_creacion) continue;
      const t = new Date(b.fecha_creacion).getTime();
      if (!Number.isFinite(t)) continue;
      if (t > best) {
        best = t;
        value = b.fecha_creacion;
      }
    }
    return value;
  }

  /**
   * Palco multipersonal: asignar cada acceso solo con el email de un usuario registrado (acepta en Mis Boletas).
   */
  puedeAsignarEntradaPorCorreoPalco(boleta: BoletaComprada, compra: Compra): boolean {
    if (compra.estado_pago !== 'completado') return false;
    if (!this.esTitularBoleta(boleta, compra)) return false;
    if (!this.requiereRegistroAsistentePalcoPosterior(boleta)) return false;
    if (this.tieneAsistenteRegistrado(boleta)) return false;
    if (this.tieneTrasladoSalienteActivo(boleta.id)) return false;
    return true;
  }

  private eventoIdDeBoleta(boleta: BoletaComprada, compra: Compra): number | null {
    const cid = compra.evento_id;
    if (cid != null && cid > 0) return cid;
    const eid = boleta.evento?.id;
    if (eid != null && eid > 0) return eid;
    return null;
  }

  otraBoletaMismoEventoTitularYaConAsistente(boleta: BoletaComprada, compra: Compra): boolean {
    const eid = this.eventoIdDeBoleta(boleta, compra);
    if (eid == null) return false;

    const esOtraConAsistente = (other: BoletaComprada, otherCompra: Compra): boolean => {
      if (other.id === boleta.id) return false;
      if (this.eventoIdDeBoleta(other, otherCompra) !== eid) return false;
      if (!this.esTitularBoleta(other, otherCompra)) return false;
      return this.tieneAsistenteRegistrado(other);
    };

    for (const row of this.comprasConBoletas) {
      for (const o of row.boletas) {
        if (esOtraConAsistente(o, row.compra)) return true;
      }
    }
    for (const o of this.entradasCedidas) {
      if (esOtraConAsistente(o, this.compraVistaParaBoletaCedida(o))) return true;
    }
    return false;
  }

  puedeMostrarBotonYoAsistoPalco(boleta: BoletaComprada, compra: Compra): boolean {
    // «Yo asisto» se permite en múltiples boletas para el mismo comprador
    // (por ejemplo, si va físicamente con más acompañantes).
    return this.puedeAsignarEntradaPorCorreoPalco(boleta, compra);
  }

  async usarMiPerfilComoAsistentePalco(boleta: BoletaComprada, compra: Compra): Promise<void> {
    if (!this.puedeMostrarBotonYoAsistoPalco(boleta, compra)) {
      return;
    }
    this.limpiarErrorAsignacion(boleta.id);

    const tipoNombre = boleta.tipo_boleta_meta?.nombre || 'esta entrada';
    const palcoTxt =
      boleta.numero_palco != null ? ` (palco ${boleta.numero_palco})` : '';
    const confirmado = await this.alertService.confirm(
      '¿Confirmas «Yo asisto»?',
      `Se guardarán en la entrada${palcoTxt} el nombre y documento de tu perfil para «${tipoNombre}». Podrás ver y usar el código QR con esos datos. ¿Deseas continuar?`,
      'Sí, usar mis datos',
      'Cancelar'
    );
    if (!confirmado) {
      return;
    }

    this.rellenarPerfilBoletaId = boleta.id;
    this.cdr.detectChanges();
    try {
      const res = await this.trasladosBoletaService.rellenarAsistentePalcoDesdePerfil(boleta.id);
      if (!res.ok) {
        await this.mostrarErrorAsignacion(boleta.id, res.error || 'Error desconocido');
        return;
      }

      this.limpiarErrorAsignacion(boleta.id);
      await this.alertService.success(
        'Listo',
        'Se aplicaron los datos de tu perfil. El código QR solo aparecerá el día del evento.'
      );
      try {
        await this.recargarBoletasYTraslados();
      } catch (e) {
        console.error(e);
        await this.alertService.warning(
          'Aviso',
          'Se aplicaron los datos, pero no se pudo recargar la pantalla automáticamente.'
        );
      }
    } finally {
      this.rellenarPerfilBoletaId = null;
      this.cdr.detectChanges();
    }
  }

  private limpiarErrorAsignacion(boletaId?: number): void {
    if (!boletaId || this.asignacionError?.boletaId === boletaId) {
      this.asignacionError = null;
    }
  }

  private async mostrarErrorAsignacion(
    boletaId: number,
    mensaje: string,
    titulo = 'No se pudo completar'
  ): Promise<void> {
    this.asignacionError = { boletaId, mensaje };
    this.cdr.detectChanges();

    if (this.esErrorAsignacionDocumento(mensaje)) {
      await this.alertService.error(titulo, undefined, {
        html: this.htmlErrorAsignacionConEnlacePerfil(mensaje),
      });
      return;
    }

    await this.alertService.error(titulo, mensaje);
  }

  esErrorAsignacionDocumento(mensaje: string): boolean {
    return /documento/i.test(mensaje) && /perfil/i.test(mensaje);
  }

  private htmlErrorAsignacionConEnlacePerfil(mensaje: string): string {
    const safe = mensaje
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    return (
      `<p class="swal-error-text">${safe}</p>` +
      `<p class="swal-perfil-link-wrap"><a href="/perfil" class="swal-perfil-link">Ir a Mi perfil</a></p>`
    );
  }

  abrirModalTraslado(boleta: BoletaComprada, compra: Compra): void {
    if (!this.puedeAsignarEntradaPorCorreoPalco(boleta, compra)) {
      return;
    }
    this.limpiarErrorAsignacion(boleta.id);
    this.trasladoBoleta = boleta;
    this.trasladoCompra = compra;
    this.emailTrasladoDestino = '';
    this.showTrasladoModal = true;
    this.cdr.detectChanges();
  }

  cerrarModalTraslado(): void {
    this.showTrasladoModal = false;
    this.trasladoBoleta = null;
    this.trasladoCompra = null;
    this.emailTrasladoDestino = '';
    this.cdr.detectChanges();
  }

  async confirmarEnvioTraslado(): Promise<void> {
    if (!this.trasladoBoleta) return;
    const email = this.emailTrasladoDestino.trim();
    if (!email) {
      this.alertService.warning('Email', 'Indica el email del usuario registrado que recibirá la entrada.');
      return;
    }
    const b = this.trasladoBoleta;
    const tipoNombre = b.tipo_boleta_meta?.nombre || 'esta entrada';
    const palcoTxt = b.numero_palco != null ? ` · palco ${b.numero_palco}` : '';
    const confirmadoEnvio = await this.alertService.confirm(
      '¿Enviar solicitud por correo?',
      `Se enviará a ${email} una solicitud para aceptar la entrada «${tipoNombre}»${palcoTxt}. Mientras esté pendiente no podrás usar el QR. ¿Enviar ahora?`,
      'Sí, enviar',
      'Cancelar'
    );
    if (!confirmadoEnvio) {
      return;
    }

    this.enviandoTraslado = true;
    this.limpiarErrorAsignacion(this.trasladoBoleta.id);
    this.cdr.detectChanges();
    try {
      const res = await this.trasladosBoletaService.iniciarTrasladoPalco(this.trasladoBoleta.id, email);
      if (!res.ok) {
        await this.mostrarErrorAsignacion(
          this.trasladoBoleta.id,
          res.error || 'Error desconocido',
          'No se pudo enviar'
        );
        return;
      }
      this.alertService.success('Enviado', 'El destinatario debe aceptar el traslado en Mis Boletas. Tú verás el estado como enviado y no podrás usar el QR hasta que canceles o él rechace.');
      this.cerrarModalTraslado();
      await this.recargarBoletasYTraslados();
    } finally {
      this.enviandoTraslado = false;
      this.cdr.detectChanges();
    }
  }

  getEstadoTrasladoLabel(estado: string | undefined): string {
    const m: Record<string, string> = {
      enviado: 'Enviado',
      recibido: 'Recibido',
      aceptado: 'Aceptado',
      rechazado: 'Rechazado',
      cancelado: 'Cancelado'
    };
    return m[estado || ''] || estado || '';
  }

  rolUsuarioEnTraslado(t: TrasladoBoleta): 'origen' | 'destino' {
    const uid = this.authService.getUsuarioId()!;
    return t.usuario_origen_id === uid ? 'origen' : 'destino';
  }

  nombreTipoBoletaTraslado(t: TrasladoBoleta): string {
    const tb = Array.isArray(t.boleta?.tipos_boleta) ? t.boleta?.tipos_boleta[0] : t.boleta?.tipos_boleta;
    return tb?.nombre || '—';
  }

  tituloEventoTraslado(t: TrasladoBoleta): string {
    const tb = Array.isArray(t.boleta?.tipos_boleta) ? t.boleta?.tipos_boleta[0] : t.boleta?.tipos_boleta;
    const ev = tb?.eventos;
    if (Array.isArray(ev)) {
      return ev[0]?.titulo || '—';
    }
    return ev?.titulo || '—';
  }

  async marcarRecibidoTraslado(t: TrasladoBoleta): Promise<void> {
    const res = await this.trasladosBoletaService.marcarRecibido(t.id);
    if (!res.ok) {
      await this.alertService.error('Error', res.error || '');
      return;
    }
    this.alertService.success('Listo', 'Marcado como recibido. Puedes aceptar o rechazar.');
    await this.recargarBoletasYTraslados();
  }

  async aceptarTraslado(t: TrasladoBoleta): Promise<void> {
    const res = await this.trasladosBoletaService.aceptar(t.id);
    if (!res.ok) {
      await this.alertService.error('Error', res.error || '');
      return;
    }
    this.alertService.success('Aceptado', 'La entrada es tuya. El código QR solo aparecerá el día del evento.');
    await this.recargarBoletasYTraslados();
  }

  async rechazarTraslado(t: TrasladoBoleta): Promise<void> {
    const res = await this.trasladosBoletaService.rechazar(t.id);
    if (!res.ok) {
      this.alertService.error('Error', res.error || '');
      return;
    }
    this.alertService.success('Rechazado', 'El remitente recupera el uso de la entrada.');
    await this.recargarBoletasYTraslados();
  }

  async cancelarTraslado(t: TrasladoBoleta): Promise<void> {
    const res = await this.trasladosBoletaService.cancelar(t.id);
    if (!res.ok) {
      this.alertService.error('Error', res.error || '');
      return;
    }
    this.alertService.success('Cancelado', 'Se anuló el envío pendiente.');
    await this.recargarBoletasYTraslados();
  }

  private async recargarBoletasYTraslados(): Promise<void> {
    await this.loadBoletasPorCompra();
    this.cdr.detectChanges();
  }

  /** Compra mínima para lógica de QR en entradas recibidas por traslado. */
  compraVistaParaBoletaCedida(b: BoletaComprada): Compra {
    const c = b.compra;
    return {
      id: b.compra_id,
      cliente_id: c?.cliente_id ?? 0,
      evento_id: (c as { evento_id?: number })?.evento_id ?? b.evento?.id ?? 0,
      numero_transaccion: c?.id ? `#${c.id}` : '-',
      total: 0,
      estado_pago: (c?.estado_pago as TipoEstadoPago | undefined) ?? TipoEstadoPago.COMPLETADO,
      estado_compra: c?.estado_compra
    } as Compra;
  }

  tieneContenidoMisBoletas(): boolean {
    return (
      this.eventosConBoletas.length > 0 ||
      this.entradasCedidas.length > 0 ||
      this.trasladosPendientesRecibir.length > 0
    );
  }

  ngOnDestroy() {
    this.persistState(Date.now());
    this.endSilentRefreshCycle();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private startSilentRefreshCycle(): void {
    this.refreshStartedAt = Date.now();
    console.info('[MisCompras] Refresco silencioso iniciado', {
      vistaActividad: this.vistaActividad,
      page: this.page
    });

    if (this.refreshIndicatorTimer) {
      clearTimeout(this.refreshIndicatorTimer);
    }
    this.isRefreshing = false;
    this.refreshIndicatorTimer = setTimeout(() => {
      this.isRefreshing = true;
      this.cdr.detectChanges();
    }, this.refreshIndicatorDelayMs);
  }

  private endSilentRefreshCycle(): void {
    if (this.refreshIndicatorTimer) {
      clearTimeout(this.refreshIndicatorTimer);
      this.refreshIndicatorTimer = null;
    }

    if (this.refreshStartedAt) {
      console.info('[MisCompras] Refresco silencioso finalizado', {
        durationMs: Date.now() - this.refreshStartedAt,
        compras: this.compras.length,
        eventos: this.eventosConBoletas.length,
        trasladosPendientes: this.trasladosPendientesRecibir.length
      });
      this.refreshStartedAt = null;
    }

    this.isRefreshing = false;
  }

  private applyCachedState(state: any): void {
    this.compras = (state.compras || []).filter(
      (compra: Compra) => compra.estado_pago === TipoEstadoPago.COMPLETADO
    );
    this.comprasConBoletas = (state.comprasConBoletas || []).filter(
      (item: { compra: Compra }) => item.compra?.estado_pago === TipoEstadoPago.COMPLETADO
    );
    this.eventosConBoletas = state.eventosConBoletas || [];
    this.eventosDisponibles = state.eventosDisponibles || [];
    this.trasladosHistorial = state.trasladosHistorial || [];
    this.trasladosPendientesRecibir = state.trasladosPendientesRecibir || [];
    this.entradasCedidas = (state.entradasCedidas || []).filter(
      (b: BoletaComprada) => b.compra?.estado_pago === TipoEstadoPago.COMPLETADO
    );
    this.estadoPagoFiltro = state.estadoPagoFiltro ?? null;
    this.estadoCompraFiltro = state.estadoCompraFiltro ?? null;
    this.eventoFiltro = state.eventoFiltro ?? null;
    this.fechaDesde = state.fechaDesde ?? '';
    this.fechaHasta = state.fechaHasta ?? '';
    this.searchTerm = state.searchTerm ?? '';
    this.page = state.page || 1;
    this.total = state.total || 0;
    this.totalPages = state.totalPages || 0;
    this.tabBoletasDetalle = state.tabBoletasDetalle || 'sin-usar';
    this.eventoExpandidoKey = state.eventoExpandidoKey ?? null;
    this.loadingBoletasDetalle = this.eventosConBoletas.length > 0;
  }

  private persistState(lastUpdated: number): void {
    const userId = this.authService.getUsuarioId();
    if (!userId) return;
    this.misComprasStateService.saveState(userId, {
      compras: this.compras,
      comprasConBoletas: this.comprasConBoletas,
      eventosConBoletas: this.eventosConBoletas,
      eventosDisponibles: this.eventosDisponibles,
      trasladosHistorial: this.trasladosHistorial,
      trasladosPendientesRecibir: this.trasladosPendientesRecibir,
      entradasCedidas: this.entradasCedidas,
      estadoPagoFiltro: this.estadoPagoFiltro,
      estadoCompraFiltro: this.estadoCompraFiltro,
      eventoFiltro: this.eventoFiltro,
      fechaDesde: this.fechaDesde,
      fechaHasta: this.fechaHasta,
      searchTerm: this.searchTerm,
      page: this.page,
      total: this.total,
      totalPages: this.totalPages,
      tabBoletasDetalle: this.tabBoletasDetalle,
      eventoExpandidoKey: this.eventoExpandidoKey,
      eventoDetalleKey: this.eventoDetalleKey,
      lastUpdated
    });
  }

  private isOffline(): boolean {
    return typeof navigator !== 'undefined' && !navigator.onLine;
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', { 
      style: 'currency', 
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  getEstadoPagoLabel(estado?: string): string {
    const estados: { [key: string]: string } = {
      'pendiente': 'Pendiente',
      'completado': 'Completado',
      'fallido': 'Fallido',
      'reembolsado': 'Reembolsado',
      'cancelado': 'Cancelado'
    };
    return estados[estado || 'pendiente'] || estado || 'Pendiente';
  }

  getEstadoCompraLabel(estado?: string): string {
    const estados: { [key: string]: string } = {
      'pendiente': 'Pendiente',
      'confirmada': 'Confirmada',
      'cancelada': 'Cancelada',
      'reembolsada': 'Reembolsada'
    };
    return estados[estado || 'pendiente'] || estado || 'Pendiente';
  }

  getEstadoBoletaLabel(estado?: string): string {
    const estados: { [key: string]: string } = {
      'pendiente': 'Sin usar',
      'usada': 'Usada',
      'cancelada': 'Cancelada',
      'reembolsada': 'Reembolsada'
    };
    return estados[estado || 'pendiente'] || estado || 'Pendiente';
  }

  getEstadoClass(estado?: string): string {
    if (estado === 'completado' || estado === 'confirmada') return 'badge-success';
    if (estado === 'pendiente') return 'badge-warning';
    if (estado === 'cancelada' || estado === 'fallido') return 'badge-danger';
    return 'badge-info';
  }

  getEstadoTrasladoClass(estado?: string): string {
    const e = estado || '';
    if (e === 'aceptado') return 'badge-success';
    if (e === 'rechazado' || e === 'cancelado') return 'badge-danger';
    if (e === 'recibido' || e === 'enviado') return 'badge-warning';
    return 'badge-info';
  }

  Math = Math;

  /**
   * En esta versión, toda boleta se asigna después del pago en Mis Boletas.
   */
  requiereRegistroAsistentePalcoPosterior(b: BoletaComprada): boolean {
    return true;
  }

  tieneAsistenteRegistrado(b: BoletaComprada): boolean {
    return !!(b.nombre_asistente?.trim() && b.documento_asistente?.trim());
  }

  private fechaInicioEventoBoleta(boleta: BoletaComprada | null | undefined, compra?: Compra | null): Date | null {
    const raw = this.eventoVistaBoleta(boleta, compra)?.fecha_inicio;
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  private fechaFinEventoBoleta(boleta: BoletaComprada | null | undefined, compra?: Compra | null): Date | null {
    const raw = this.fechaFinEvento(this.eventoVistaBoleta(boleta, compra));
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  /** Día local YYYYMMDD para comparar rangos de calendario sin depender de la hora. */
  private diaCalendarioLocal(d: Date): number {
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }

  /**
   * True si hoy (fecha local) está entre fecha_inicio y fecha_fin del evento (inclusive).
   * Sin fecha_fin se usa solo el día de fecha_inicio (evento de un día).
   */
  esDiaEventoBoleta(boleta: BoletaComprada | null | undefined, compra?: Compra | null): boolean {
    const inicio = this.fechaInicioEventoBoleta(boleta, compra);
    if (!inicio) return true;
    const fin = this.fechaFinEventoBoleta(boleta, compra);
    const hoy = new Date();
    const h = this.diaCalendarioLocal(hoy);
    const a = this.diaCalendarioLocal(inicio);
    const b = fin ? this.diaCalendarioLocal(fin) : a;
    const desde = Math.min(a, b);
    const hasta = Math.max(a, b);
    return h >= desde && h <= hasta;
  }

  fechaModalBoleta(boleta: BoletaComprada | null | undefined, compra?: Compra | null): string {
    const fechaEvento = this.fechaInicioEventoBoleta(boleta, compra);
    if (!fechaEvento) return '';
    return new Intl.DateTimeFormat('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(fechaEvento);
  }

  horaModalBoleta(boleta: BoletaComprada | null | undefined, compra?: Compra | null): string {
    const fechaEvento = this.fechaInicioEventoBoleta(boleta, compra);
    if (!fechaEvento) return '';
    return new Intl.DateTimeFormat('es-CO', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(fechaEvento);
  }

  mensajeHabilitacionQrBoleta(boleta: BoletaComprada | null | undefined, compra?: Compra | null): string {
    const inicio = this.fechaInicioEventoBoleta(boleta, compra);
    if (!inicio) {
      return 'El código QR solo será visible el día del evento. Hoy aún no está disponible en la app.';
    }
    return `El código QR se habilita el ${this.formatFechaHabilitacionAmigable(inicio)}.`;
  }

  esBoletaUsada(boleta: BoletaComprada | null | undefined): boolean {
    return (boleta?.estado || '').toLowerCase() === 'usada';
  }

  esBoletaCancelada(boleta: BoletaComprada | null | undefined): boolean {
    return (boleta?.estado || '').toLowerCase() === 'cancelada';
  }

  puedeAbrirVistaBoleta(boleta: BoletaComprada, compra: Compra): boolean {
    if (compra.estado_pago !== 'completado') return false;
    if (!this.esTitularBoleta(boleta, compra)) return false;
    if (this.tieneTrasladoSalienteActivo(boleta.id)) return false;
    if (this.requiereRegistroAsistentePalcoPosterior(boleta) && !this.tieneAsistenteRegistrado(boleta)) {
      return false;
    }
    return true;
  }

  puedeMostrarQrBoleta(boleta: BoletaComprada, compra: Compra): boolean {
    return this.puedeAbrirVistaBoleta(boleta, compra) && !this.esBoletaUsada(boleta) && this.esDiaEventoBoleta(boleta, compra);
  }

  /**
   * Muestra la vista previa de la boleta con QR
   */
  async verBoleta(boleta: BoletaComprada, compra: Compra) {
    // Solo permitir ver boleta si el pago está completado
    if (compra.estado_pago !== 'completado') {
      this.alertService.warning('Pago pendiente', 'El código QR estará disponible una vez que el pago sea completado');
      return;
    }

    if (!this.esTitularBoleta(boleta, compra)) {
      this.alertService.warning('No disponible', 'Esta entrada no está asignada a tu usuario.');
      return;
    }

    if (this.tieneTrasladoSalienteActivo(boleta.id)) {
      this.alertService.warning(
        'Traslado enviado',
        'No puedes ver el QR mientras el destinatario no acepte o rechace. Puedes cancelar el envío si sigue en estado enviado.'
      );
      return;
    }

    if (!this.puedeAbrirVistaBoleta(boleta, compra)) {
      this.alertService.warning(
        'Asigna la entrada',
        'Asigna por correo a quien usará el acceso (debe aceptar en Mis Boletas) o usa «Yo asisto» si tú la usarás con los datos de tu perfil.'
      );
      return;
    }

    this.boletaSeleccionada = boleta;
    this.compraSeleccionada = compra;
    this.eventoSeleccionado = this.eventoVistaBoleta(boleta, compra);
    this.tipoBoletaSeleccionado = this.tipoBoletaVistaBoleta(boleta);
    const debeGenerarQr = compra.estado_pago === 'completado' && !this.esBoletaUsada(boleta) && this.esDiaEventoBoleta(boleta, compra);
    this.loadingQR = debeGenerarQr;
    this.showBoletaModal = true;
    this.cdr.detectChanges();

    // Generar QR solo entre fecha_inicio y fecha_fin del evento (días locales) y mientras la boleta no haya sido usada.
    if (debeGenerarQr) {
      try {
        this.qrCodeUrl = await QRCode.toDataURL(boleta.codigo_qr, {
          width: 200,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });
      } catch (err) {
        console.error('Error generando QR:', err);
        this.qrCodeUrl = '';
      } finally {
        this.loadingQR = false;
        this.cdr.detectChanges();
      }
    } else {
      this.qrCodeUrl = '';
      this.loadingQR = false;
    }

    // Completar información del evento y tipo de boleta si la consulta inicial no trajo todo.
    try {
      const tipoBoleta = await this.boletasService.getTipoBoletaById(boleta.tipo_boleta_id);
      if (!tipoBoleta) {
        this.cdr.detectChanges();
        return;
      }

      this.tipoBoletaSeleccionado = tipoBoleta;

      try {
        if (!this.eventoSeleccionado?.lugar && tipoBoleta.evento_id) {
          const evento = await this.eventosService.getEventoById(tipoBoleta.evento_id);
          this.eventoSeleccionado = evento || this.eventoSeleccionado;
        }
        this.cdr.detectChanges();
      } catch (err) {
        console.error('Error obteniendo evento:', err);
        this.cdr.detectChanges();
      }
    } catch (err) {
      console.error('Error obteniendo tipo de boleta:', err);
      this.cdr.detectChanges();
    }
  }

  /**
   * Cierra el modal de vista previa
   */
  cerrarBoletaModal() {
    this.showBoletaModal = false;
    this.boletaSeleccionada = null;
    this.compraSeleccionada = null;
    this.eventoSeleccionado = null;
    this.tipoBoletaSeleccionado = null;
    this.qrCodeUrl = '';
  }

  /**
   * Genera e imprime el PDF de una boleta
   */
  async imprimirBoletaPDF(boleta: BoletaComprada, compra: Compra) {
    try {
      if (!this.esTitularBoleta(boleta, compra)) {
        this.alertService.warning('No disponible', 'No tienes acceso a esta entrada.');
        return;
      }
      if (this.tieneTrasladoSalienteActivo(boleta.id)) {
        this.alertService.warning('Traslado en curso', 'No puedes imprimir el QR mientras el envío esté pendiente.');
        return;
      }
      if (!this.puedeAbrirVistaBoleta(boleta, compra)) {
        this.alertService.warning(
          'Registra al asistente',
          'Primero completa la asignación del asistente para poder generar el PDF con QR.'
        );
        return;
      }
      if (this.esBoletaUsada(boleta)) {
        this.alertService.warning('Boleta usada', 'Esta boleta ya fue usada y no permite generar QR ni PDF.');
        return;
      }
      if (!this.esDiaEventoBoleta(boleta, compra)) {
        this.alertService.warning('QR bloqueado por seguridad', this.mensajeHabilitacionQrBoleta(boleta, compra));
        return;
      }
      // Obtener información del tipo de boleta y evento
      const tipoBoleta = await this.boletasService.getTipoBoletaById(boleta.tipo_boleta_id);
      
      if (!tipoBoleta) {
        this.alertService.error('Error', 'No se pudo obtener la información del tipo de boleta');
        return;
      }

      // Obtener información del evento
      const evento = await this.eventosService.getEventoById(tipoBoleta.evento_id);
      
      if (!evento) {
        this.alertService.error('Error', 'No se pudo obtener la información del evento');
        return;
      }

      // Generar el PDF
      await this.generarPDF(boleta, compra, tipoBoleta, evento);
    } catch (error) {
      console.error('Error al generar PDF:', error);
      this.alertService.error('Error', 'Error al generar el PDF de la boleta');
    }
  }

  /**
   * Genera el PDF usando el diseño HTML
   */
  private async generarPDF(boleta: BoletaComprada, compra: Compra, tipoBoleta: TipoBoleta, evento: Evento) {
    // Asegurarnos de que el template esté actualizado con los datos actuales
    // (Angular ya se encarga de esto mediante el binding en el HTML)
    
    // Esperar un ciclo para que el DOM se actualice
    await new Promise(resolve => setTimeout(resolve, 100));

    const element = document.getElementById('ticket-template');
    if (!element) {
      console.error('No se encontró el elemento ticket-template');
      return;
    }

    try {
      // Convertir HTML a Canvas
      const canvas = await html2canvas(element, {
        scale: 2, // Mejor calidad
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      });

      const imgData = canvas.toDataURL('image/png');
      
      const doc = new jsPDF({
        orientation: 'landscape', // Diseño horizontal para el ticket
        unit: 'mm',
        format: [80, 180] // Tamaño personalizado del ticket
      });

      // Añadir la imagen al PDF
      doc.addImage(imgData, 'PNG', 0, 0, 180, 80);

      // Guardar el PDF
      const fileName = `Ticket_${boleta.codigo_qr}_${evento.titulo.substring(0, 20).replace(/[^a-z0-9]/gi, '_')}.pdf`;
      doc.save(fileName);
    } catch (err) {
      console.error('Error convirtiendo HTML a PDF:', err);
      throw err;
    }
  }
}

