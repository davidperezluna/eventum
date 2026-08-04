import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { WOMPI_CHECKOUT_STORAGE_KEY } from '../pago-wompi/pago-wompi';
import { coversEventumEnabled } from '../../core/covers-feature';
import { COMPRA_COPY, lineasDetalleVinculoCarrito } from '../../core/compra-copy';
import { Subscription } from 'rxjs';
import { BoletasService } from '../../services/boletas.service';
import {
  CarritoCompraService,
  ItemCarritoCover,
  ItemCarritoEvento,
  ItemCarritoProducto,
  LugarCoverCarrito,
} from '../../services/carrito-compra.service';
import { ComprasClienteService, ItemCompra } from '../../services/compras-cliente.service';
import { ComprasProductoService } from '../../services/compras-producto.service';
import { ProductosService } from '../../services/productos.service';
import { CuponesService } from '../../services/cupones.service';
import { AuthService } from '../../services/auth.service';
import { UsuariosService } from '../../services/usuarios.service';
import { AlertService } from '../../services/alert.service';
import { EventosService } from '../../services/eventos.service';
import { SupabaseService } from '../../services/supabase.service';
import { supabaseConfig } from '../../config/supabase.config';
import { getPagoResultadoUrl } from '../../config/app-url';
import { irALoginCliente } from '../../core/login-redirect';
import { CoversService } from '../../services/covers.service';
import { labelSesionCover } from '../../core/covers-labels';
import { TERMINOS_LICOR_TEXTO, TERMINOS_LICOR_TITULO } from '../../constants/productos.constants';
import {
  DetalleEventoState,
  DetalleEventoStateService,
} from '../../services/detalle-evento-state.service';
import {
  CuponDescuento,
  EstadoPalco,
  Evento,
  Palco,
  Producto,
  TipoBoleta,
  TipoEstadoEvento,
  Usuario
} from '../../types';

@Component({
  selector: 'app-carrito',
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './carrito.html',
  styleUrl: './carrito.css'
})
export class Carrito implements OnInit, OnDestroy {
  evento: Evento | null = null;
  lugarCover: LugarCoverCarrito | null = null;
  usuario: Usuario | null = null;
  itemsCompra: ItemCarritoEvento[] = [];
  itemsCover: ItemCarritoCover[] = [];
  itemsProductos: ItemCarritoProducto[] = [];

  codigoCupon = '';
  cuponAplicado: CuponDescuento | null = null;
  cuponAbierto = false;
  validandoCupon = false;
  private cuponRestaurado = false;
  comprando = false;
  vaciandoCarrito = false;
  terminosAceptados = false;
  modalTerminosLicor = false;
  readonly terminosLicorTitulo = TERMINOS_LICOR_TITULO;
  readonly terminosLicorTexto = TERMINOS_LICOR_TEXTO;

  palcosDisponiblesPorTipo = new Map<number, Palco[]>();
  palcosCatalogoPorTipo = new Map<number, Palco[]>();
  private palcoFocoSlotPorTipo = new Map<number, number>();
  private palcosLoadingTipo = new Set<number>();
  private refreshPalcosSeq = 0;
  checkoutPendienteEnCurso: {
    transaccionCheckoutId: number;
    checkoutUrl: string | null;
    expiro: boolean;
    expiresAtMs: number | null;
    totalPago: number;
    eventoTitulo: string | null;
  } | null = null;
  cancelandoCheckoutPendiente = false;
  cambiandoCuentaGoogle = false;
  /** Solo bloquea la vista si no hay datos locales del carrito ni cache del evento. */
  inicializandoCarrito = false;
  private cancelacionCheckoutSeq = 0;
  private refreshIndicatorTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly refreshIndicatorDelayMs = 800;
  mapaAmpliado: { url: string; titulo: string } | null = null;
  private subscriptions = new Subscription();
  private unsubscribeAuth?: () => void;
  /** null = aún sin confirmar (muestra upsell); false = sin productos; true = con productos. */
  eventoTieneProductosDisponibles: boolean | null = null;
  nowMs = Date.now();
  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    public router: Router,
    private route: ActivatedRoute,
    private boletasService: BoletasService,
    private carritoCompraService: CarritoCompraService,
    private comprasClienteService: ComprasClienteService,
    private comprasProductoService: ComprasProductoService,
    private productosService: ProductosService,
    private cuponesService: CuponesService,
    private authService: AuthService,
    private usuariosService: UsuariosService,
    private alertService: AlertService,
    private eventosService: EventosService,
    private supabaseService: SupabaseService,
    private coversService: CoversService,
    private detalleEventoStateService: DetalleEventoStateService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.usuario = this.authService.getUsuario();
    this.hidratarDesdeCacheDetalleEvento();

    if (this.route.snapshot.queryParamMap.get('aviso') === 'pago-wompi-sin-datos') {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { aviso: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
      this.alertService.snackbar(
        'No encontramos los datos del pago. Si acabas de iniciar una compra, vuelve a finalizar desde el carrito.'
      );
    }

    this.unsubscribeAuth = this.authService.onAuthStateChange((_user, usuario) => {
      this.usuario = usuario;
      if (usuario) {
        void this.restaurarCuponDesdeCache();
        void this.cargarCheckoutPendienteEnCarrito();
      } else {
        this.cuponRestaurado = false;
        this.checkoutPendienteEnCurso = null;
      }
      this.cdr.detectChanges();
    });

    this.startCountdownTicker();
    this.subscriptions.add(
      this.carritoCompraService.items$.subscribe((items) => {
        this.itemsCompra = items.map((item) => ({
          ...item,
          palco_ids: item.palco_ids ? [...item.palco_ids] : undefined
        }));
        this.limpiarCuponSiCompraMixta();
        const eventoId = this.evento?.id ?? this.carritoCompraService.getEventoSnapshot()?.id;
        const tieneCache = !!(eventoId && this.detalleEventoStateService.getState(eventoId));
        void this.refrescarPalcosDisponibles({ background: tieneCache });
      })
    );

    this.subscriptions.add(
      this.carritoCompraService.itemsCover$.subscribe((items) => {
        this.itemsCover = items.map((item) => ({ ...item }));
        this.cdr.detectChanges();
      })
    );

    this.subscriptions.add(
      this.carritoCompraService.lugarCover$.subscribe((lugar) => {
        this.lugarCover = lugar;
        this.cdr.detectChanges();
      })
    );

    this.subscriptions.add(
      this.carritoCompraService.itemsProductos$.subscribe((items) => {
        this.itemsProductos = items.map((item) => ({
          ...item,
          producto: { ...item.producto }
        }));
        this.limpiarCuponSiCompraMixta();
      })
    );

    this.subscriptions.add(
      this.carritoCompraService.evento$.subscribe((evento) => {
        this.evento = evento;
        this.carritoCompraService.clearCuponSiEventoDistinto(evento?.id ?? null);
        const productosCache = this.carritoCompraService.getEventoTieneProductosCache(evento?.id ?? null);
        this.eventoTieneProductosDisponibles = productosCache;
        const tieneCacheDetalle = !!(evento?.id && this.detalleEventoStateService.getState(evento.id));
        if (tieneCacheDetalle) {
          this.hidratarDesdeCacheDetalleEvento(evento!.id);
        }
        void this.cargarDisponibilidadProductosUpsell(evento?.id ?? null, { background: tieneCacheDetalle });
        if (evento?.id) {
          void this.refrescarEvento(evento.id, { background: tieneCacheDetalle });
        }
        void this.cargarCheckoutPendienteEnCarrito();
        void this.restaurarCuponDesdeCache();
      })
    );

    this.subscriptions.add(
      this.carritoCompraService.cupon$.subscribe((cupon) => {
        this.codigoCupon = cupon.codigoCupon;
        this.cuponAplicado = cupon.cuponAplicado;
        this.cuponAbierto = cupon.abierto;
        this.cdr.detectChanges();
      })
    );

    const tieneDatosLocales = !this.carritoCompraService.estaVacio() || !!this.carritoCompraService.getEventoSnapshot();
    this.inicializandoCarrito = !tieneDatosLocales;
    void this.bootstrapCarrito({ background: tieneDatosLocales });
  }

  private async bootstrapCarrito(options?: { background?: boolean }): Promise<void> {
    const background = options?.background ?? false;
    if (background) {
      this.startSilentRefreshIndicator();
    }
    try {
      await this.validarSesionEnSegundoPlano();
    } finally {
      this.inicializandoCarrito = false;
      this.stopSilentRefreshIndicator();
      this.cdr.detectChanges();
    }
  }

  get mostrarLoadingCarrito(): boolean {
    return this.inicializandoCarrito;
  }

  private hidratarDesdeCacheDetalleEvento(eventoId?: number): void {
    const id = eventoId ?? this.carritoCompraService.getEventoSnapshot()?.id ?? this.evento?.id;
    if (!id) return;

    const cached = this.detalleEventoStateService.getState(id);
    if (!cached) return;

    this.evento = { ...cached.evento };
    this.carritoCompraService.syncEvento(this.evento);
    this.eventoTieneProductosDisponibles = cached.tieneProductos;
    this.carritoCompraService.setEventoTieneProductosCache(id, cached.tieneProductos);
    this.applyPalcosFromDetalleCache(cached);
    this.cdr.detectChanges();
  }

  private applyPalcosFromDetalleCache(cached: DetalleEventoState): void {
    for (const item of this.carritoCompraService.getItemsSnapshot()) {
      if (!this.esLineaPalcoMultipersona(item.tipo)) continue;
      const tipoId = item.tipo.id;
      const disponibles = cached.palcosDisponiblesPorTipo.get(tipoId);
      const catalogo = cached.palcosCatalogoPorTipo.get(tipoId);
      if (disponibles) {
        this.palcosDisponiblesPorTipo.set(tipoId, [...disponibles]);
      }
      if (catalogo) {
        this.palcosCatalogoPorTipo.set(tipoId, [...catalogo]);
      }
    }
  }

  private persistDetalleCacheParcial(lastUpdated: number): void {
    const eventoId = this.evento?.id;
    if (!eventoId || !this.evento) return;

    const existing = this.detalleEventoStateService.getState(eventoId);
    const palcosDisponibles = new Map(existing?.palcosDisponiblesPorTipo ?? []);
    const palcosCatalogo = new Map(existing?.palcosCatalogoPorTipo ?? []);

    for (const [tipoId, list] of this.palcosDisponiblesPorTipo.entries()) {
      palcosDisponibles.set(tipoId, [...list]);
    }
    for (const [tipoId, list] of this.palcosCatalogoPorTipo.entries()) {
      palcosCatalogo.set(tipoId, [...list]);
    }

    this.detalleEventoStateService.saveState(eventoId, {
      evento: this.evento,
      tiposBoleta: existing?.tiposBoleta ?? [],
      tieneProductos:
        typeof this.eventoTieneProductosDisponibles === 'boolean'
          ? this.eventoTieneProductosDisponibles
          : (existing?.tieneProductos ?? false),
      productos: existing?.productos ?? [],
      lugar: existing?.lugar ?? null,
      categoria: existing?.categoria ?? null,
      palcosDisponiblesPorTipo: palcosDisponibles,
      palcosCatalogoPorTipo: palcosCatalogo,
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

  ngOnDestroy(): void {
    this.stopCountdownTicker();
    this.stopSilentRefreshIndicator();
    this.persistDetalleCacheParcial(Date.now());
    this.subscriptions.unsubscribe();
    this.unsubscribeAuth?.();
  }

  get carritoVacio(): boolean {
    return this.carritoCompraService.estaVacio();
  }

  /** Vacío real: sin ítems y sin checkout pendiente. */
  get mostrarEstadoCarritoVacio(): boolean {
    return this.carritoVacio && !this.checkoutPendienteEnCurso;
  }

  /** Barra inferior / cabecera con contenido activo (ítems o pago pendiente). */
  get tieneContenidoCarritoVisible(): boolean {
    return !this.carritoVacio || !!this.checkoutPendienteEnCurso;
  }

  get mostrarAgregarMasBoletas(): boolean {
    return !!this.evento?.id && !this.esCarritoCover();
  }

  get mostrarAgregarMasProductos(): boolean {
    return (
      !!this.evento?.id &&
      !this.esCarritoCover() &&
      this.eventoTieneProductosDisponibles !== false
    );
  }

  get mostrarSeccionBoletas(): boolean {
    return this.itemsCompra.length > 0 || this.mostrarAgregarMasBoletas;
  }

  get mostrarSeccionProductos(): boolean {
    return this.itemsProductos.length > 0 || this.mostrarAgregarMasProductos;
  }

  get unidadesBoletasEnCarrito(): number {
    return this.itemsCompra.reduce((acc, item) => acc + item.cantidad, 0);
  }

  get unidadesProductosEnCarrito(): number {
    return this.itemsProductos.reduce((acc, item) => acc + item.cantidad, 0);
  }

  get mostrarCupon(): boolean {
    if (this.itemsCompra.length === 0) return false;
    if (this.esCompraMixtaBoletasProductos) return false;
    return !!this.usuario || !!this.authService.getCurrentUser();
  }

  /** El cupón solo aplica a boletas; en compra mixta se descarta. */
  private limpiarCuponSiCompraMixta(): void {
    if (!this.esCompraMixtaBoletasProductos) return;
    if (this.cuponAplicado || this.codigoCupon.trim() || this.cuponAbierto) {
      this.carritoCompraService.clearCupon();
      this.cuponRestaurado = false;
    }
  }

  /** Correo de la cuenta Eventum a la que se vincularán boletas/productos tras pagar. */
  get emailCuentaCompra(): string {
    return (this.usuario?.email || this.authService.getCurrentUser()?.email || '').trim();
  }

  get tieneSesionParaVinculo(): boolean {
    return !!this.emailCuentaCompra;
  }

  readonly coversEventumEnabled = coversEventumEnabled;
  readonly compraCopy = COMPRA_COPY;

  get lineasDetalleVinculo(): string[] {
    return lineasDetalleVinculoCarrito({
      unidadesBoletas: this.totalUnidadesBoletasEnCarrito(),
      unidadesProductos: this.totalUnidadesProductosEnCarrito(),
      esMixto: this.esCompraMixtaBoletasProductos,
      tieneBoletas: this.tieneBoletasEnCarrito,
      tieneProductos: this.tieneProductosEnCarrito,
    });
  }

  tienePalcosIncompletos(): boolean {
    return this.itemsCompra.some(
      (item) => this.esLineaPalcoMultipersona(item.tipo) && !this.palcosSeleccionCompletos(item),
    );
  }

  get hintAccionCompra(): string | null {
    if (this.checkoutPendienteEnCurso) {
      return null;
    }
    if (this.tienePalcosIncompletos()) {
      return 'Selecciona todos los palcos antes de finalizar la compra.';
    }
    return null;
  }

  get labelBotonFinalizarCompra(): string {
    if (this.comprando) {
      return 'Procesando…';
    }
    if (this.checkoutPendienteEnCurso) {
      return 'Pago en curso: recupéralo o cancélalo';
    }
    return 'Finalizar compra';
  }

  async cambiarCuentaGoogleParaCompra(): Promise<void> {
    if (this.cambiandoCuentaGoogle) return;
    this.cambiandoCuentaGoogle = true;
    this.cdr.detectChanges();
    const { error } = await this.authService.cambiarCuentaGoogle('/carrito');
    if (error) {
      this.cambiandoCuentaGoogle = false;
      this.cdr.detectChanges();
      void this.alertService.warning(
        'No se pudo cambiar de cuenta',
        'Intenta de nuevo o cierra sesión desde Mi perfil.'
      );
    }
  }

  totalUnidadesBoletasEnCarrito(): number {
    return this.itemsCompra.reduce((acc, item) => acc + item.cantidad, 0);
  }

  totalUnidadesProductosEnCarrito(): number {
    return this.itemsProductos.reduce((acc, item) => acc + item.cantidad, 0);
  }

  get tieneBoletasEnCarrito(): boolean {
    return this.itemsCompra.length > 0;
  }

  get tieneProductosEnCarrito(): boolean {
    return this.itemsProductos.length > 0;
  }

  /** Boletas + productos en el mismo checkout de evento. */
  get esCompraMixtaBoletasProductos(): boolean {
    return this.tieneBoletasEnCarrito && this.tieneProductosEnCarrito;
  }

  get mostrarAvisoVinculoCompra(): boolean {
    return this.tieneBoletasEnCarrito || this.tieneProductosEnCarrito;
  }

  tieneLicor(): boolean {
    return this.carritoCompraService.tieneLicorEnCarrito();
  }

  getDisponiblesProducto(producto: Producto): number {
    return producto.cantidad_disponibles ?? Math.max(0, producto.cantidad_total - (producto.cantidad_vendidas ?? 0));
  }

  precioEventoVigenteProducto(): boolean {
    if (!this.evento?.fecha_inicio) return false;
    return new Date(this.evento.fecha_inicio).getTime() <= Date.now();
  }

  getPrecioPreventaProducto(producto: Producto): number {
    const ref = Number(producto.precio_preventa ?? producto.precio ?? 0);
    return Number.isFinite(ref) && ref >= 0 ? ref : 0;
  }

  getPrecioEventoProducto(producto: Producto): number {
    const ref = Number(producto.precio_evento ?? producto.precio ?? 0);
    return Number.isFinite(ref) && ref >= 0 ? ref : this.getPrecioPreventaProducto(producto);
  }

  tienePrecioDiferenciadoProducto(producto: Producto): boolean {
    return this.getPrecioEventoProducto(producto) !== this.getPrecioPreventaProducto(producto);
  }

  getPrecioReferenciaProducto(producto: Producto): number {
    return this.precioEventoVigenteProducto()
      ? this.getPrecioPreventaProducto(producto)
      : this.getPrecioEventoProducto(producto);
  }

  getAhorroUnitarioProducto(producto: Producto): number {
    if (this.precioEventoVigenteProducto()) return 0;
    return Math.max(0, this.getPrecioEventoProducto(producto) - this.getPrecioPreventaProducto(producto));
  }

  getEstadoPrecioProductoLabel(): 'Preventa' | 'En evento' {
    return this.precioEventoVigenteProducto() ? 'En evento' : 'Preventa';
  }

  preventaActivaProducto(): boolean {
    if (!this.evento?.fecha_inicio) return false;
    return new Date(this.evento.fecha_inicio).getTime() > this.nowMs;
  }

  shouldShowPreventaHintProducto(): boolean {
    if (!this.preventaUrgenteProducto()) return false;
    return this.itemsProductos.some((item) => this.getAhorroUnitarioProducto(item.producto) > 0);
  }

  getPreventaCountdownLabelProducto(): string {
    if (!this.preventaActivaProducto() || !this.evento?.fecha_inicio) return '';
    const targetMs = new Date(this.evento.fecha_inicio).getTime();
    const remainingMs = Math.max(0, targetMs - this.nowMs);
    const totalMinutes = Math.floor(remainingMs / 60000);
    const dias = Math.floor(totalMinutes / (60 * 24));
    const horas = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutos = totalMinutes % 60;

    if (dias > 0) return `Termina en ${dias}d ${horas}h`;
    if (horas > 0) return `Termina en ${horas}h ${minutos}m`;
    return `Termina en ${Math.max(1, minutos)}m`;
  }

  preventaUrgenteProducto(): boolean {
    if (!this.preventaActivaProducto() || !this.evento?.fecha_inicio) return false;
    const targetMs = new Date(this.evento.fecha_inicio).getTime();
    return targetMs - this.nowMs <= 24 * 60 * 60 * 1000;
  }

  agregarProducto(item: ItemCarritoProducto): void {
    this.carritoCompraService.agregarProductoAlCarrito(item.producto);
  }

  quitarProducto(item: ItemCarritoProducto): void {
    this.carritoCompraService.quitarProductoDelCarrito(item.producto.id);
  }

  eliminarProducto(item: ItemCarritoProducto): void {
    this.carritoCompraService.eliminarProductoDelCarrito(item.producto.id);
  }

  async aceptarTerminosLicor(): Promise<void> {
    this.terminosAceptados = true;
    this.cerrarModalTerminosLicor();
    await this.procesarCompra();
  }

  cerrarModalTerminosLicor(): void {
    this.modalTerminosLicor = false;
  }

  get terminosLicorLineas(): string[] {
    return this.terminosLicorTexto
      .split('\n')
      .map((linea) => linea.replace(/\*\*/g, '').trim())
      .filter(Boolean);
  }

  irAgregarBoletas(): void {
    if (!this.evento?.id) {
      this.irAEventos();
      return;
    }
    void this.router.navigate(['/carrito/agregar', this.evento.id, 'boletas']);
  }

  irAgregarProductos(): void {
    if (!this.evento?.id) {
      this.irAEventos();
      return;
    }
    void this.router.navigate(['/carrito/agregar', this.evento.id, 'productos']);
  }

  volverAlEvento(): void {
    this.irAgregarProductos();
  }

  async vaciarCarritoConfirmado(): Promise<void> {
    if (this.vaciandoCarrito || this.comprando || this.carritoVacio) {
      return;
    }

    const pendiente = this.checkoutPendienteEnCurso;
    const confirmado = await this.alertService.confirm(
      'Vaciar carrito',
      pendiente
        ? 'Se quitarán todos los artículos y se cancelará el pago pendiente. ¿Continuar?'
        : 'Se quitarán todos los artículos del carrito. ¿Continuar?',
      'Vaciar carrito',
      'Cancelar',
    );
    if (!confirmado) {
      return;
    }

    this.vaciandoCarrito = true;
    this.cdr.detectChanges();
    try {
      if (pendiente) {
        await this.ejecutarCancelacionCheckout(pendiente.transaccionCheckoutId, { notificarExito: false });
        this.limpiarCheckoutPendienteLocal();
      }
      this.carritoCompraService.vaciarCarrito();
      this.terminosAceptados = false;
      this.checkoutPendienteEnCurso = null;
      this.alertService.snackbar('Carrito vaciado');
    } finally {
      this.vaciandoCarrito = false;
      this.cdr.detectChanges();
    }
  }

  irAEventos(): void {
    const destino = this.authService.isAdministrador() ? '/probar-compras' : '/eventos-cliente';
    this.router.navigate([destino]);
  }

  async refrescarEvento(eventoId: number, options?: { background?: boolean }): Promise<void> {
    const background = options?.background ?? false;
    if (background) {
      this.startSilentRefreshIndicator();
    }
    try {
      const evento = await this.eventosService.getEventoById(eventoId);
      this.evento = evento;
      this.carritoCompraService.syncEvento(evento);
      this.persistDetalleCacheParcial(Date.now());
    } catch (error) {
      console.error('No se pudo refrescar el evento del carrito:', error);
    } finally {
      if (background) {
        this.stopSilentRefreshIndicator();
      }
      this.cdr.detectChanges();
    }
  }

  private async validarSesionEnSegundoPlano(): Promise<void> {
    const sesionValida = await this.authService.ensureActiveSession();
    if (!sesionValida) {
      this.usuario = null;
      this.cuponRestaurado = false;
      this.checkoutPendienteEnCurso = null;
      this.cdr.detectChanges();
      return;
    }
    this.usuario = this.authService.getUsuario();
    await this.cargarCheckoutPendienteEnCarrito();
    void this.restaurarCuponDesdeCache();
    this.cdr.detectChanges();
  }

  private async requerirSesionActiva(expirada = false): Promise<number | null> {
    const sesionValida = await this.authService.ensureActiveSession();
    if (!sesionValida) {
      this.usuario = null;
      this.cuponRestaurado = false;
      irALoginCliente(this.router, '/carrito', expirada ? 'sesion-expirada' : 'pagar');
      return null;
    }

    const clienteId = this.authService.getUsuarioId();
    if (!clienteId) {
      this.usuario = null;
      this.cuponRestaurado = false;
      irALoginCliente(this.router, '/carrito', 'pagar');
      return null;
    }

    this.usuario = this.authService.getUsuario();
    return clienteId;
  }

  private manejarErrorSesionExpirada(): void {
    this.usuario = null;
    this.cuponRestaurado = false;
    irALoginCliente(this.router, '/carrito', 'sesion-expirada');
  }

  private async resolverCheckoutPendiente(clienteId: number, eventoId: number | null): Promise<{
    transaccionCheckoutId: number;
    checkoutUrl: string | null;
    expiro: boolean;
    expiresAtMs: number | null;
    totalPago: number;
    eventoTitulo: string | null;
  } | null> {
    try {
      const { data } = await this.supabaseService
        .from('transacciones_checkout')
        .select('id, checkout_url, expires_at, evento_id, total, eventos(titulo)')
        .eq('cliente_id', clienteId)
        .eq('estado', 'pendiente')
        .eq('es_activa', true)
        .order('fecha_creacion', { ascending: false })
        .limit(20);

      const candidatos = (data || []).map((row) => {
        const expiresAtMs = row.expires_at ? new Date(String(row.expires_at)).getTime() : null;
        const expiro =
          expiresAtMs != null && Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now();
        return {
          ...row,
          expiresAtMs: expiresAtMs != null && Number.isFinite(expiresAtMs) ? expiresAtMs : null,
          expiro,
        };
      });
      if (candidatos.length === 0) {
        return null;
      }

      const candidato =
        (eventoId ? candidatos.find((row) => Number(row.evento_id) === eventoId) : null) ?? candidatos[0];

      return {
        transaccionCheckoutId: Number(candidato.id),
        checkoutUrl: candidato.checkout_url ? String(candidato.checkout_url) : null,
        expiro: !!candidato.expiro,
        expiresAtMs: candidato.expiresAtMs,
        totalPago: Number(candidato.total) || 0,
        eventoTitulo: this.tituloEventoCheckoutRow(candidato),
      };
    } catch {
      return null;
    }
  }

  private async cargarCheckoutPendienteEnCarrito(): Promise<void> {
    const clienteId = this.authService.getUsuarioId();
    if (!clienteId) {
      this.checkoutPendienteEnCurso = null;
      return;
    }
    const eventoId = this.evento?.id ?? null;
    const pendiente = await this.resolverCheckoutPendiente(clienteId, eventoId);
    if (!pendiente) {
      this.checkoutPendienteEnCurso = null;
      return;
    }
    if (pendiente.expiro) {
      const cancelado = await this.cancelarCheckoutVencidoAutomaticamente(pendiente);
      if (!cancelado) {
        this.checkoutPendienteEnCurso = pendiente;
      }
      return;
    }
    this.checkoutPendienteEnCurso = pendiente;
  }

  private async siguePendienteCheckout(transaccionCheckoutId: number): Promise<boolean> {
    try {
      const { data } = await this.supabaseService
        .from('transacciones_checkout')
        .select('id, estado, es_activa')
        .eq('id', transaccionCheckoutId)
        .maybeSingle();
      if (!data) return false;
      return data.estado === 'pendiente' && data.es_activa === true;
    } catch {
      return true;
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const timeoutPromise = new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      });
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private guardarCheckoutPendienteEnCarrito(
    pendiente: {
      transaccionCheckoutId: number;
      checkoutUrl: string | null;
      expiro: boolean;
      expiresAtMs: number | null;
      totalPago: number;
      eventoTitulo: string | null;
    }
  ): void {
    this.checkoutPendienteEnCurso = pendiente;
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(
        'eventum_pago_pendiente',
        JSON.stringify({ transaccion_checkout_id: pendiente.transaccionCheckoutId })
      );
    }
  }

  recuperarCheckoutPendiente(): void {
    const pendiente = this.checkoutPendienteEnCurso;
    if (!pendiente) {
      return;
    }
    if (!pendiente.expiro && pendiente.checkoutUrl) {
      this.navegarAPagoWompi({
        checkoutUrl: pendiente.checkoutUrl,
        totalPago: pendiente.totalPago,
        eventoTitulo: pendiente.eventoTitulo,
      });
      return;
    }
    void this.router.navigate(['/pago-resultado'], {
      queryParams: { transaccion_checkout_id: pendiente.transaccionCheckoutId },
    });
  }

  private tituloEventoCheckoutRow(row: { eventos?: unknown }): string | null {
    const eventoRel = Array.isArray(row.eventos) ? row.eventos[0] : row.eventos;
    const titulo = (eventoRel as { titulo?: string | null } | null)?.titulo;
    return titulo ? String(titulo).trim() : null;
  }

  private navegarAPagoWompi(opts: {
    checkoutUrl: string;
    totalPago: number;
    eventoTitulo?: string | null;
  }): void {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(
        WOMPI_CHECKOUT_STORAGE_KEY,
        JSON.stringify({
          checkoutUrl: opts.checkoutUrl,
          emailCuenta: this.emailCuentaCompra,
          totalPago: opts.totalPago,
          eventoTitulo:
            opts.eventoTitulo ?? this.evento?.titulo ?? this.lugarCover?.nombre ?? null,
        }),
      );
    }
    void this.router.navigate(['/pago-wompi']);
  }

  ocultarAvisoCheckoutPendiente(): void {
    this.checkoutPendienteEnCurso = null;
  }

  private limpiarCheckoutPendienteLocal(): void {
    this.checkoutPendienteEnCurso = null;
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('eventum_pago_pendiente');
    }
  }

  private async ejecutarCancelacionCheckout(
    transaccionCheckoutId: number,
    options?: { notificarExito?: boolean }
  ): Promise<boolean> {
    const ok = await this.withTimeout(
      this.comprasProductoService.cancelarCheckoutPendiente(transaccionCheckoutId),
      12000,
      false
    );
    if (!ok) {
      const siguePendiente = await this.withTimeout(
        this.siguePendienteCheckout(transaccionCheckoutId),
        6000,
        true
      );
      if (!siguePendiente) {
        this.limpiarCheckoutPendienteLocal();
        if (options?.notificarExito !== false) {
          this.alertService.snackbarSuccess('Pago pendiente cancelado', 'Ya puedes crear una compra nueva.');
        }
        return true;
      }
      return false;
    }

    this.limpiarCheckoutPendienteLocal();
    if (options?.notificarExito !== false) {
      this.alertService.snackbarSuccess('Pago pendiente cancelado', 'Ya puedes crear una compra nueva.');
    }
    return true;
  }

  private async cancelarCheckoutVencidoAutomaticamente(pendiente: {
    transaccionCheckoutId: number;
    checkoutUrl: string | null;
    expiro: boolean;
    expiresAtMs: number | null;
    totalPago: number;
    eventoTitulo: string | null;
  }): Promise<boolean> {
    if (this.cancelandoCheckoutPendiente) {
      return false;
    }
    this.cancelandoCheckoutPendiente = true;
    this.cdr.detectChanges();
    try {
      const cancelado = await this.ejecutarCancelacionCheckout(pendiente.transaccionCheckoutId, {
        notificarExito: false,
      });
      if (cancelado) {
        this.alertService.snackbar(
          'El pago vencido se canceló automáticamente. Ya puedes hacer una compra nueva.'
        );
      }
      return cancelado;
    } catch (error: unknown) {
      console.error('Error cancelando checkout vencido:', error);
      return false;
    } finally {
      this.cancelandoCheckoutPendiente = false;
      this.cdr.detectChanges();
    }
  }

  async cancelarCheckoutPendiente(): Promise<void> {
    const pendiente = this.checkoutPendienteEnCurso;
    if (!pendiente || this.cancelandoCheckoutPendiente) {
      return;
    }
    const opId = ++this.cancelacionCheckoutSeq;
    this.cancelandoCheckoutPendiente = true;
    this.cdr.detectChanges();
    const watchdog = setTimeout(() => {
      if (this.cancelacionCheckoutSeq === opId && this.cancelandoCheckoutPendiente) {
        this.cancelandoCheckoutPendiente = false;
        this.cdr.detectChanges();
      }
    }, 15000);
    try {
      const ok = await this.ejecutarCancelacionCheckout(pendiente.transaccionCheckoutId);
      if (!ok) {
        this.alertService.snackbarError(
          'No se pudo cancelar el pago pendiente',
          'Intenta de nuevo en unos segundos o usa "Recuperar pago pendiente".'
        );
      }
    } catch (error: any) {
      this.alertService.snackbarError(
        'No se pudo cancelar el pago pendiente',
        error?.message || 'Error inesperado al cancelar el checkout.'
      );
    } finally {
      clearTimeout(watchdog);
      if (this.cancelacionCheckoutSeq === opId) {
        this.cancelandoCheckoutPendiente = false;
      }
      this.cdr.detectChanges();
    }
  }

  async loadUsuarioById(usuarioId: number): Promise<void> {
    try {
      this.usuario = await this.usuariosService.getUsuarioById(usuarioId);
    } catch (error) {
      console.error('Error cargando usuario:', error);
    }
  }

  cuposPorPalco(tipo: TipoBoleta): number {
    return Math.max(1, Number(tipo.personas_por_unidad ?? 1));
  }

  esLineaPalcoMultipersona(tipo: TipoBoleta): boolean {
    return this.cuposPorPalco(tipo) > 1;
  }

  /** Carrito con al menos una línea vinculada a sesión cover. */
  esCarritoCover(): boolean {
    return this.carritoCompraService.esCarritoSoloCover();
  }

  getSubtotalCovers(): number {
    return this.carritoCompraService.getSubtotalCovers();
  }

  labelCoverSesion(item: ItemCarritoCover): string {
    if (item.sesion_fecha && item.hora_apertura && item.hora_cierre) {
      return labelSesionCover({
        fecha: item.sesion_fecha,
        hora_apertura: item.hora_apertura,
        hora_cierre: item.hora_cierre,
      });
    }

    const label = item.sesion_cover_label?.trim() ?? '';
    if (!label) return '';

    const suffix = ` · ${item.tipo_cover_nombre}`;
    if (label.endsWith(suffix)) {
      return label.slice(0, -suffix.length);
    }

    return label;
  }

  quitarCoverDelCarrito(item: ItemCarritoCover): void {
    this.carritoCompraService.quitarCoverDelCarrito(item.sesion_cover_id);
  }

  agregarCoverAlCarrito(item: ItemCarritoCover): void {
    const lugar = this.lugarCover;
    if (!lugar) return;
    this.carritoCompraService.agregarCoverIndependiente({
      lugar,
      tipoCoverId: item.tipo_cover_id,
      tipoCoverNombre: item.tipo_cover_nombre,
      sesionCoverId: item.sesion_cover_id,
      sesionCoverLabel: item.sesion_cover_label,
      sesionFecha: item.sesion_fecha,
      horaApertura: item.hora_apertura,
      horaCierre: item.hora_cierre,
      precioSesion: item.precio,
      wompiCuentaId: item.wompi_cuenta_id,
    });
  }

  eliminarCoverDelCarrito(item: ItemCarritoCover): void {
    this.carritoCompraService.eliminarCoverDelCarrito(item.sesion_cover_id);
  }

  getCantidadEnCarrito(tipo: TipoBoleta): number {
    return this.carritoCompraService.getCantidadEnCarrito(tipo.id);
  }

  agregarAlCarrito(item: ItemCarritoEvento): void {
    const maxCantidad = this.maxCantidadLinea(item);
    const agregado = this.carritoCompraService.agregarAlCarrito(
      item.tipo,
      item.sesion_cover_id,
      maxCantidad,
    );
    if (!agregado) {
      this.alertService.warning('Stock limitado', `Solo puedes agregar ${maxCantidad} entrada(s) de este tipo.`);
    }
  }

  quitarDelCarrito(item: ItemCarritoEvento): void {
    this.carritoCompraService.quitarDelCarrito(item.tipo.id, item.sesion_cover_id);
  }

  eliminarDelCarrito(item: ItemCarritoEvento): void {
    this.carritoCompraService.eliminarDelCarrito(item.tipo.id, item.sesion_cover_id);
  }

  maxCantidadLinea(item: ItemCarritoEvento): number {
    const stockPalcos = this.esLineaPalcoMultipersona(item.tipo)
      ? (this.palcosDisponiblesPorTipo.get(item.tipo.id) ?? []).length
      : null;
    return this.carritoCompraService.maxCantidadBoleta(item.tipo, stockPalcos);
  }

  getSubtotalBoletas(): number {
    return this.itemsCompra.reduce((sum, item) => sum + (item.tipo.precio * item.cantidad), 0);
  }

  getSubtotalProductos(): number {
    return this.carritoCompraService.getSubtotalProductos();
  }

  getSubtotal(): number {
    return this.getSubtotalBoletas() + this.getSubtotalCovers() + this.getSubtotalProductos();
  }

  getDescuento(): number {
    if (!this.cuponAplicado || this.esCompraMixtaBoletasProductos) return 0;
    return (this.getSubtotalBoletas() * this.cuponAplicado.porcentaje_descuento) / 100;
  }

  getPorcentajeServicio(): number {
    const raw = this.esCarritoCover() && !this.evento
      ? Number(this.lugarCover?.covers_porcentaje_servicio ?? 0)
      : Number(this.evento?.porcentaje_servicio ?? 0);
    if (!Number.isFinite(raw)) return 0;
    return Math.min(100, Math.max(0, raw));
  }

  getBaseNetaBoletas(): number {
    return Math.max(0, this.getSubtotalBoletas() - this.getDescuento());
  }

  /** Subtotal antes del % de servicio (boletas netas + covers + productos). */
  getSubtotalNeta(): number {
    return this.getBaseNetaBoletas() + this.getSubtotalCovers() + this.getSubtotalProductos();
  }

  getValorServicio(): number {
    return (this.getSubtotalNeta() * this.getPorcentajeServicio()) / 100;
  }

  getTotalBoletas(): number {
    if (this.itemsCompra.length === 0) return 0;
    const base = this.getBaseNetaBoletas();
    const baseTotal = this.getBaseNetaBoletas() + this.getSubtotalProductos();
    if (baseTotal === 0) return 0;
    const servicio = this.getValorServicio() * (base / baseTotal);
    return base + servicio;
  }

  getTotalProductos(): number {
    if (this.itemsProductos.length === 0) return 0;
    const base = this.getSubtotalProductos();
    const baseTotal = this.getBaseNetaBoletas() + this.getSubtotalProductos();
    if (baseTotal === 0) return 0;
    const servicio = this.getValorServicio() * (base / baseTotal);
    return base + servicio;
  }

  getTotal(): number {
    return this.getSubtotalNeta() + this.getValorServicio();
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  shouldShowCheckoutCountdown(): boolean {
    const pendiente = this.checkoutPendienteEnCurso;
    return !!pendiente && !pendiente.expiro && pendiente.expiresAtMs != null;
  }

  getCheckoutRemainingMs(): number {
    const pendiente = this.checkoutPendienteEnCurso;
    if (!pendiente?.expiresAtMs) return 0;
    return Math.max(0, pendiente.expiresAtMs - this.nowMs);
  }

  getCheckoutCountdownLabel(): string {
    const remainingMs = this.getCheckoutRemainingMs();
    if (remainingMs <= 0) return '00:00';

    const totalSeconds = Math.floor(remainingMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n: number) => String(n).padStart(2, '0');

    if (hours > 0) {
      return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  }

  isCheckoutCountdownUrgent(): boolean {
    return this.getCheckoutRemainingMs() > 0 && this.getCheckoutRemainingMs() <= 5 * 60 * 1000;
  }

  private tickCountdown(): void {
    this.nowMs = Date.now();
    const pendiente = this.checkoutPendienteEnCurso;
    if (
      pendiente &&
      !pendiente.expiro &&
      !this.cancelandoCheckoutPendiente &&
      pendiente.expiresAtMs != null &&
      this.nowMs >= pendiente.expiresAtMs
    ) {
      void this.cancelarCheckoutVencidoAutomaticamente({ ...pendiente, expiro: true });
      return;
    }
    this.cdr.detectChanges();
  }

  private startCountdownTicker(): void {
    this.stopCountdownTicker();
    this.tickCountdown();
    this.countdownTimer = setInterval(() => this.tickCountdown(), 1000);
  }

  private stopCountdownTicker(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  private async cargarDisponibilidadProductosUpsell(
    eventoId: number | null,
    options?: { background?: boolean },
  ): Promise<void> {
    if (!eventoId) {
      this.eventoTieneProductosDisponibles = null;
      this.cdr.detectChanges();
      return;
    }

    const cached = this.detalleEventoStateService.getState(eventoId);
    if (cached && this.eventoTieneProductosDisponibles === null) {
      this.eventoTieneProductosDisponibles = cached.tieneProductos;
      this.carritoCompraService.setEventoTieneProductosCache(eventoId, cached.tieneProductos);
      this.cdr.detectChanges();
    }

    const background = options?.background ?? false;
    if (background) {
      this.startSilentRefreshIndicator();
    }

    try {
      const tieneProductos = await this.productosService.eventoTieneProductos(eventoId);
      this.carritoCompraService.setEventoTieneProductosCache(eventoId, tieneProductos);
      this.eventoTieneProductosDisponibles = tieneProductos;
      this.persistDetalleCacheParcial(Date.now());
    } catch {
      if (this.eventoTieneProductosDisponibles === null) {
        this.eventoTieneProductosDisponibles = false;
      }
    } finally {
      if (background) {
        this.stopSilentRefreshIndicator();
      }
      this.cdr.detectChanges();
    }
  }

  onCodigoCuponChange(valor: string): void {
    this.carritoCompraService.setCodigoCupon(valor);
  }

  onCuponToggle(event: Event): void {
    const abierto = (event.target as HTMLDetailsElement).open;
    this.carritoCompraService.setCuponAbierto(abierto);
  }

  private async restaurarCuponDesdeCache(): Promise<void> {
    if (!this.usuario || !this.evento?.id || this.cuponRestaurado) return;
    if (this.esCompraMixtaBoletasProductos) {
      this.limpiarCuponSiCompraMixta();
      return;
    }

    const cuponCache = this.carritoCompraService.getCuponSnapshot();
    if (cuponCache.eventoId !== this.evento.id) return;

    this.cuponRestaurado = true;

    if (cuponCache.cuponAplicado) {
      const valido = await this.cuponesService.validarCupon(
        cuponCache.cuponAplicado.codigo,
        this.evento.id,
      );
      this.ngZone.run(() => {
        if (valido) {
          this.carritoCompraService.setCuponAplicado(valido, this.evento!.id);
        } else {
          this.carritoCompraService.clearCupon();
        }
        this.cdr.detectChanges();
      });
      return;
    }

    const codigo = cuponCache.codigoCupon.trim();
    if (!codigo) return;

    const valido = await this.cuponesService.validarCupon(codigo, this.evento.id);
    this.ngZone.run(() => {
      if (valido) {
        this.carritoCompraService.setCuponAplicado(valido, this.evento!.id);
      }
      this.cdr.detectChanges();
    });
  }

  async aplicarCupon(): Promise<void> {
    if (!this.usuario) return;
    if (this.esCompraMixtaBoletasProductos) {
      void this.alertService.warning(
        'Cupón no disponible',
        'Los cupones solo aplican cuando compras boletas sin productos en el mismo pedido.'
      );
      return;
    }

    const codigoNormalizado = this.codigoCupon.trim().toUpperCase();
    if (!codigoNormalizado || !this.evento) return;

    this.carritoCompraService.setCodigoCupon(codigoNormalizado);
    this.validandoCupon = true;
    this.cdr.detectChanges();

    try {
      const cupon = await this.cuponesService.validarCupon(codigoNormalizado, this.evento.id);
      this.ngZone.run(() => {
        this.validandoCupon = false;
        if (cupon) {
          this.carritoCompraService.setCuponAplicado(cupon, this.evento!.id);
        } else {
          this.carritoCompraService.setCuponAplicado(null, this.evento!.id);
        }
        this.cdr.detectChanges();
      });
      if (!cupon) {
        void this.alertService.snackbarError(
          'Cupón inválido',
          'El código no existe, expiró o alcanzó su límite de usos'
        );
      }
    } catch (error) {
      console.error('Error aplicando cupón:', error);
      this.ngZone.run(() => {
        this.carritoCompraService.setCuponAplicado(null, this.evento!.id);
        this.validandoCupon = false;
        this.cdr.detectChanges();
      });
      void this.alertService.snackbarError('Error', 'No se pudo validar el cupón');
    }
  }

  quitarCupon(): void {
    this.carritoCompraService.clearCupon();
    this.cuponRestaurado = false;
    this.cdr.detectChanges();
  }

  cantidadPalcosReservados(tipo: TipoBoleta): number {
    if (this.esLineaPalcoMultipersona(tipo)) {
      const catalogo = this.palcosCatalogoPorTipo.get(tipo.id) ?? [];
      return catalogo.filter((p) => String(p.estado).toLowerCase() === EstadoPalco.RESERVADO).length;
    }
    const total = Number(tipo.cantidad_total ?? 0);
    const vendidas = Number(tipo.cantidad_vendidas ?? 0);
    const disponibles = Number(tipo.cantidad_disponibles ?? 0);
    return Math.max(0, total - vendidas - disponibles);
  }

  getIndicesUnidadesPalco(item: ItemCarritoEvento): number[] {
    if (this.esLineaPalcoMultipersona(item.tipo)) {
      if (!item.palco_ids || item.palco_ids.length !== item.cantidad) {
        item.palco_ids = Array.from({ length: item.cantidad }, () => null);
        this.persistirItems();
      }
    }
    return Array.from({ length: item.cantidad }, (_, i) => i);
  }

  trackBySlotIndex(_: number, ui: number): number {
    return ui;
  }

  trackByPalcoId(_: number, p: Palco): number {
    return p.id;
  }

  opcionesPalcoEnSlot(item: ItemCarritoEvento, slotIndex: number): Palco[] {
    const lista = this.palcosDisponiblesPorTipo.get(item.tipo.id) || [];
    const tomados = new Set<number>();
    (item.palco_ids || []).forEach((id, idx) => {
      if (idx !== slotIndex && id != null) tomados.add(id);
    });
    const actual = item.palco_ids?.[slotIndex];
    return lista.filter((p) => !tomados.has(p.id) || p.id === actual);
  }

  palcosGridCatalogo(item: ItemCarritoEvento): Palco[] {
    const catalogo = this.palcosCatalogoPorTipo.get(item.tipo.id) || [];
    if (catalogo.length > 0) {
      return [...catalogo].sort((a, b) => a.numero - b.numero);
    }
    // Fallback inicial: mostrar al menos los palcos disponibles mientras llega el catálogo completo.
    const disponibles = this.palcosDisponiblesPorTipo.get(item.tipo.id) || [];
    if (disponibles.length === 0) {
      void this.refrescarPalcosTipo(item.tipo.id);
    }
    return [...disponibles].sort((a, b) => a.numero - b.numero);
  }

  getFocoSlotPalco(item: ItemCarritoEvento): number {
    const tid = item.tipo.id;
    let f = this.palcoFocoSlotPorTipo.get(tid);
    if (f == null || f < 0 || f >= item.cantidad) {
      f = 0;
    }
    return f;
  }

  setFocoSlotPalco(item: ItemCarritoEvento, slot: number): void {
    if (slot < 0 || slot >= item.cantidad) return;
    this.palcoFocoSlotPorTipo.set(item.tipo.id, slot);
  }

  esPalcoClicableEnFoco(item: ItemCarritoEvento, palco: Palco): boolean {
    const slot = this.getFocoSlotPalco(item);
    return this.opcionesPalcoEnSlot(item, slot).some((p) => p.id === palco.id);
  }

  claseCeldaPalco(palco: Palco, item: ItemCarritoEvento): Record<string, boolean> {
    const slot = this.getFocoSlotPalco(item);
    const ids = item.palco_ids || [];
    const esDisponible = palco.estado === EstadoPalco.DISPONIBLE || String(palco.estado) === 'disponible';
    const clickeable = this.esPalcoClicableEnFoco(item, palco);
    const selIdx = ids.findIndex((id) => id === palco.id);
    return {
      'palco-cell': true,
      'palco-cell--nodisp': !esDisponible,
      'palco-cell--elegido': selIdx !== -1,
      'palco-cell--activo': ids[slot] === palco.id,
      'palco-cell--clic': clickeable
    };
  }

  seleccionarPalcoCelda(item: ItemCarritoEvento, palco: Palco): void {
    const slot = this.getFocoSlotPalco(item);
    if (!this.esPalcoClicableEnFoco(item, palco)) return;
    if (!item.palco_ids || item.palco_ids.length !== item.cantidad) {
      item.palco_ids = Array.from({ length: item.cantidad }, () => null);
    }
    item.palco_ids[slot] = palco.id;
    const nextVacio = item.palco_ids.findIndex((id, i) => i > slot && id == null);
    const cualVacio = item.palco_ids.findIndex((id) => id == null);
    if (nextVacio !== -1) {
      this.palcoFocoSlotPorTipo.set(item.tipo.id, nextVacio);
    } else if (cualVacio !== -1) {
      this.palcoFocoSlotPorTipo.set(item.tipo.id, cualVacio);
    }
    this.persistirItems();
  }

  limpiarPalcoSlot(item: ItemCarritoEvento, slotIndex: number): void {
    if (!item.palco_ids || slotIndex < 0 || slotIndex >= item.palco_ids.length) return;
    item.palco_ids[slotIndex] = null;
    this.palcoFocoSlotPorTipo.set(item.tipo.id, slotIndex);
    this.persistirItems();
  }

  palcosSeleccionCompletos(item: ItemCarritoEvento): boolean {
    const ids = item.palco_ids || [];
    if (ids.length !== item.cantidad) return false;
    return ids.every((id) => id != null);
  }

  numeroPalcoPorId(item: ItemCarritoEvento, palcoId: number | null | undefined): number | null {
    if (palcoId == null) return null;
    const listCatalogo = this.palcosCatalogoPorTipo.get(item.tipo.id) || [];
    const listDisponibles = this.palcosDisponiblesPorTipo.get(item.tipo.id) || [];
    const found = listCatalogo.find((p) => p.id === palcoId) || listDisponibles.find((p) => p.id === palcoId);
    if (found) return found.numero;
    // Fallback visual: evita "sin número" cuando aún no llegó el catálogo completo.
    return palcoId;
  }

  abrirMapaAmpliado(url: string, titulo: string): void {
    this.mapaAmpliado = { url, titulo };
  }

  cerrarMapaAmpliado(): void {
    this.mapaAmpliado = null;
  }

  private async refrescarPalcosDisponibles(options?: { background?: boolean }): Promise<void> {
    const seq = ++this.refreshPalcosSeq;
    const eventoId = this.evento?.id;
    const cached = eventoId ? this.detalleEventoStateService.getState(eventoId) : null;
    if (cached) {
      this.applyPalcosFromDetalleCache(cached);
    }

    const background = options?.background ?? false;
    if (background) {
      this.startSilentRefreshIndicator();
    }

    const tiposPalco = this.itemsCompra
      .map((item) => item.tipo)
      .filter((tipo, index, arr) =>
        this.esLineaPalcoMultipersona(tipo) && arr.findIndex((t) => t.id === tipo.id) === index
      );

    const nextDisponibles = new Map(this.palcosDisponiblesPorTipo);
    const nextCatalogo = new Map(this.palcosCatalogoPorTipo);

    for (const tipo of tiposPalco) {
      const result = await this.obtenerPalcosTipoConFallback(tipo.id);
      nextDisponibles.set(tipo.id, result.disponibles);
      nextCatalogo.set(tipo.id, result.catalogo);
    }

    if (seq !== this.refreshPalcosSeq) {
      return;
    }

    this.palcosDisponiblesPorTipo = nextDisponibles;
    this.palcosCatalogoPorTipo = nextCatalogo;
    this.persistDetalleCacheParcial(Date.now());

    if (background) {
      this.stopSilentRefreshIndicator();
    }
    this.cdr.detectChanges();
  }

  private async refrescarPalcosTipo(tipoId: number): Promise<void> {
    if (this.palcosLoadingTipo.has(tipoId)) {
      return;
    }
    this.palcosLoadingTipo.add(tipoId);
    try {
      const result = await this.obtenerPalcosTipoConFallback(tipoId);
      this.palcosDisponiblesPorTipo.set(tipoId, result.disponibles);
      this.palcosCatalogoPorTipo.set(tipoId, result.catalogo);
      this.cdr.detectChanges();
    } finally {
      this.palcosLoadingTipo.delete(tipoId);
    }
  }

  private async obtenerPalcosTipoConFallback(tipoId: number): Promise<{ disponibles: Palco[]; catalogo: Palco[] }> {
    const [dispRes, catRes] = await Promise.allSettled([
      this.boletasService.getPalcosDisponiblesParaVenta(tipoId),
      this.boletasService.getPalcosPorTipo(tipoId)
    ]);

    const dispOk = dispRes.status === 'fulfilled' ? (dispRes.value || []) : null;
    const catOk = catRes.status === 'fulfilled' ? (catRes.value || []) : null;

    if (dispRes.status === 'rejected') {
      console.error(`Error obteniendo palcos disponibles (tipo ${tipoId}):`, dispRes.reason);
    }
    if (catRes.status === 'rejected') {
      console.error(`Error obteniendo catálogo de palcos (tipo ${tipoId}):`, catRes.reason);
    }

    const prevDisp = this.palcosDisponiblesPorTipo.get(tipoId) || [];
    const prevCat = this.palcosCatalogoPorTipo.get(tipoId) || [];
    const disponibles = dispOk ?? prevDisp;
    const catalogo = catOk && catOk.length > 0
      ? catOk
      : (disponibles.length > 0 ? disponibles : prevCat);

    return { disponibles, catalogo };
  }

  private persistirItems(): void {
    this.carritoCompraService.reemplazarItems(this.itemsCompra);
  }

  async procesarCompra(): Promise<void> {
    if (this.carritoCompraService.estaVacio()) {
      this.alertService.warning('Carrito vacío', 'Debes agregar al menos un item');
      return;
    }

    const carritoMixto =
      this.itemsCover.length > 0 &&
      (this.itemsCompra.length > 0 || this.itemsProductos.length > 0 || !!this.evento);

    if (carritoMixto) {
      const pagarCovers = !!this.lugarCover || this.esCarritoCover();
      if (pagarCovers) {
        const vaciarEvento = await this.alertService.confirm(
          'Carrito incompatible',
          'No puedes pagar covers y entradas/productos juntos. ¿Vaciar entradas y productos para pagar solo covers?',
          'Vaciar y continuar',
          'Cancelar',
        );
        if (!vaciarEvento) {
          return;
        }
        this.carritoCompraService.limpiarContenidoEvento();
      } else {
        const vaciarCovers = await this.alertService.confirm(
          'Carrito incompatible',
          'Tienes covers y entradas en el carrito. ¿Vaciar covers para pagar solo entradas y productos?',
          'Vaciar covers',
          'Cancelar',
        );
        if (!vaciarCovers) {
          return;
        }
        this.carritoCompraService.limpiarContenidoCover();
      }
    }

    const esSoloCover = this.esCarritoCover();
    if (!esSoloCover && !this.evento) {
      this.alertService.warning('Carrito vacío', 'Debes agregar al menos una boleta, palco o producto');
      return;
    }

    if (this.tieneLicor() && !this.terminosAceptados) {
      this.modalTerminosLicor = true;
      return;
    }

    const totalPago = this.getTotal();

    if (!esSoloCover && this.evento) {
      const ahora = new Date();
      const fechaFin = new Date(this.evento.fecha_fin);
      if (fechaFin < ahora || this.evento.estado === TipoEstadoEvento.FINALIZADO || this.evento.estado === TipoEstadoEvento.CANCELADO) {
        this.alertService.error('Evento finalizado', 'Este evento ya no está disponible para compra');
        return;
      }
    }

    const clienteId = await this.requerirSesionActiva();
    if (!clienteId) {
      return;
    }

    const checkoutPendiente = esSoloCover
      ? null
      : await this.resolverCheckoutPendiente(clienteId, this.evento!.id);
    if (checkoutPendiente) {
      this.guardarCheckoutPendienteEnCarrito(checkoutPendiente);
      this.alertService.snackbar(
        'Tienes un pago en curso. Recupéralo o cancélalo para poder finalizar una compra nueva.'
      );
      return;
    }
    this.checkoutPendienteEnCurso = null;

    for (const item of this.itemsCompra) {
      if (this.esLineaPalcoMultipersona(item.tipo)) {
        const pids = item.palco_ids || [];
        if (pids.length !== item.cantidad || pids.some((x) => x == null)) {
          this.alertService.warning('Palcos incompletos', `Debes seleccionar todos los palcos en "${item.tipo.nombre}"`);
          return;
        }
      }
    }

    const itemsCoverPedido = this.itemsCover.map((item) => ({
      tipo_cover_id: item.tipo_cover_id,
      sesion_cover_id: item.sesion_cover_id,
      cantidad: item.cantidad,
      precio_unitario: item.precio,
    }));

    const wompiCuentaCover = this.itemsCover.find((i) => i.wompi_cuenta_id)?.wompi_cuenta_id ?? null;
    const pedidoCovers = esSoloCover && this.lugarCover
      ? {
          lugar_id: this.lugarCover.id,
          cliente_id: clienteId,
          items: itemsCoverPedido,
          subtotal: this.getSubtotalCovers(),
          descuento_total: 0,
          porcentaje_servicio: this.getPorcentajeServicio(),
          valor_servicio: this.getValorServicio(),
          total: this.getTotal(),
          wompi_cuenta_id: wompiCuentaCover,
        }
      : null;

    const itemsBoletas: ItemCompra[] = this.itemsCompra.map((item) => {
      const base: ItemCompra = {
        tipo_boleta_id: item.tipo.id,
        cantidad: item.cantidad,
        precio_unitario: item.tipo.precio,
      };
      if (item.sesion_cover_id) {
        base.sesion_cover_id = item.sesion_cover_id;
      }
      if (this.esLineaPalcoMultipersona(item.tipo)) {
        return {
          ...base,
          palco_ids: item.palco_ids!.map((id) => id as number),
        };
      }
      return base;
    });

    const itemsProductosCompra = this.itemsProductos.map((item) => ({
      producto_id: item.producto.id,
      cantidad: item.cantidad,
      precio_unitario: item.producto.precio
    }));

    this.comprando = true;
    let compraBoletasId: number | null = null;
    let compraProductosId: number | null = null;
    const tieneProductosEnCarrito = this.itemsProductos.length > 0;
    const pedidoProductos = tieneProductosEnCarrito && this.evento
      ? {
          evento_id: this.evento.id,
          cliente_id: clienteId,
          items: itemsProductosCompra,
          subtotal: this.getSubtotalProductos(),
          porcentaje_servicio: this.getPorcentajeServicio(),
          valor_servicio: this.getTotalProductos() - this.getSubtotalProductos(),
          total: this.getTotalProductos(),
          terminos_licor_aceptados: this.tieneLicor() && this.terminosAceptados
        }
      : null;
    const pedidoBoletas = this.itemsCompra.length > 0 && this.evento
      ? {
          evento_id: this.evento.id,
          cliente_id: clienteId,
          items: itemsBoletas,
          cupon_id: this.cuponAplicado?.id ?? null,
          descuento_total: this.getDescuento(),
          subtotal: this.getSubtotalBoletas(),
          porcentaje_servicio: this.getPorcentajeServicio(),
          valor_servicio: this.getTotalBoletas() - this.getBaseNetaBoletas(),
          total: this.getTotalBoletas()
        }
      : null;

    try {
      if (pedidoCovers) {
        const validacionCover = await this.coversService.validarDisponibilidadCover(itemsCoverPedido);
        if (!validacionCover.valido) {
          this.alertService.error('Error de disponibilidad', validacionCover.errores.join('\n'));
          return;
        }
      }

      if (this.itemsCompra.length > 0) {
        await this.refrescarPalcosDisponibles();
        const validacionBoletas = await this.comprasClienteService.validarDisponibilidad(itemsBoletas);
        if (!validacionBoletas.valido) {
          this.alertService.error('Error de disponibilidad', validacionBoletas.errores.join('\n'));
          return;
        }
      }

      if (this.itemsProductos.length > 0) {
        const validacionProductos = await this.comprasProductoService.validarDisponibilidad(itemsProductosCompra);
        if (!validacionProductos.valido) {
          this.alertService.error('Disponibilidad de productos', validacionProductos.errores.join('\n'));
          return;
        }
      }

      const totalPago = this.getTotal();

      // Compra gratuita: sí se crean registros porque no hay pasarela (éxito inmediato).
      if (totalPago === 0 && tieneProductosEnCarrito && pedidoProductos) {
        const resultadoProductos = await this.comprasProductoService.procesarCompra({
          ...pedidoProductos,
          terminos_licor_aceptados: pedidoProductos.terminos_licor_aceptados
        });
        compraProductosId = resultadoProductos.compra.id;
      }

      if (totalPago === 0) {
        let compraCoverId: number | null = null;
        if (pedidoCovers) {
          const resultadoCover = await this.coversService.procesarCompraCover({
            ...pedidoCovers,
            confirmada: true,
          });
          compraCoverId = resultadoCover.compra_cover_id;
        }
        if (!compraBoletasId && this.itemsCompra.length > 0 && this.evento) {
          const resultadoBoletas = await this.comprasClienteService.procesarCompra({
            evento_id: this.evento.id,
            cliente_id: clienteId,
            items: itemsBoletas,
            cupon_id: this.cuponAplicado?.id,
            descuento_total: this.getDescuento(),
            subtotal: this.getSubtotalBoletas(),
            porcentaje_servicio: this.getPorcentajeServicio(),
            valor_servicio: this.getTotalBoletas() - this.getBaseNetaBoletas(),
            total: this.getTotalBoletas()
          });
          compraBoletasId = resultadoBoletas.compra.id;
          await this.comprasClienteService.confirmarPago(compraBoletasId);
        }
        if (compraProductosId) {
          await this.comprasProductoService.confirmarPago(compraProductosId);
        }
        this.carritoCompraService.vaciarCarrito();
        this.alertService.success('¡Compra exitosa!', 'Tu pedido fue confirmado correctamente');
        this.router.navigate(['/pago-resultado'], {
          queryParams: {
            compra_id: compraBoletasId ?? undefined,
            compra_cover_id: compraCoverId ?? undefined,
            compra_producto_id: compraProductosId ?? undefined,
            status: 'APPROVED'
          }
        });
        return;
      }

      const wompiBody: Record<string, unknown> = {
        amount_in_cents: Math.round(totalPago * 100),
        customer_email: this.usuario?.email || '',
        redirect_url: getPagoResultadoUrl(),
      };

      const esCover = !!pedidoCovers;
      if (pedidoCovers && pedidoProductos) {
        wompiBody['tipo'] = 'cover_mixto';
        wompiBody['pedido_covers'] = pedidoCovers;
        wompiBody['pedido_productos'] = pedidoProductos;
      } else if (pedidoCovers) {
        wompiBody['tipo'] = 'cover';
        wompiBody['pedido_covers'] = pedidoCovers;
      } else if (pedidoBoletas && pedidoProductos) {
        wompiBody['tipo'] = 'mixto';
        wompiBody['pedido_boletas'] = pedidoBoletas;
        wompiBody['pedido_productos'] = pedidoProductos;
      } else if (pedidoBoletas) {
        wompiBody['tipo'] = 'boletas';
        wompiBody['pedido_boletas'] = pedidoBoletas;
      } else if (pedidoProductos) {
        wompiBody['tipo'] = 'productos';
        wompiBody['pedido_productos'] = pedidoProductos;
      } else {
        throw new Error('No hay items para procesar');
      }

      const supabaseUrl = supabaseConfig.url;
      const { data: { session } } = await this.supabaseService.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new Error('No se pudo obtener token de autenticación');
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/wompi-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          apikey: supabaseConfig.anonKey
        },
        body: JSON.stringify(wompiBody)
      });

      const responseData = await response.json();
      if (!response.ok || !responseData.success) {
        throw new Error(responseData.error || 'Error creando transacción en Wompi');
      }

      const checkoutUrl = responseData.checkout_url || responseData.transaction?.checkout_url;
      if (!checkoutUrl) {
        throw new Error('No se obtuvo URL de checkout');
      }

      if (typeof sessionStorage !== 'undefined') {
        const pending: Record<string, number> = {};
        if (responseData.transaccion_producto_id) {
          pending['transaccion_producto_id'] = Number(responseData.transaccion_producto_id);
        }
        if (responseData.transaccion_checkout_id) {
          pending['transaccion_checkout_id'] = Number(responseData.transaccion_checkout_id);
        }
        if (Object.keys(pending).length > 0) {
          sessionStorage.setItem('eventum_pago_pendiente', JSON.stringify(pending));
        }
      }

      this.navegarAPagoWompi({
        checkoutUrl,
        totalPago,
        eventoTitulo: this.evento?.titulo || this.lugarCover?.nombre || null,
      });
    } catch (error: any) {
      console.error('Error procesando compra:', error);
      if (this.authService.isAuthOrRlsError(error?.message)) {
        await this.authService.ensureActiveSession();
        this.manejarErrorSesionExpirada();
        return;
      }
      this.alertService.error('Error al procesar compra', error?.message || 'Error desconocido');
    } finally {
      this.comprando = false;
    }
  }
}

