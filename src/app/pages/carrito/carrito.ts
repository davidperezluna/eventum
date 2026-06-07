import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
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
  } | null = null;
  cancelandoCheckoutPendiente = false;
  private cancelacionCheckoutSeq = 0;
  mapaAmpliado: { url: string; titulo: string } | null = null;
  private subscriptions = new Subscription();
  private unsubscribeAuth?: () => void;
  /** null = aún sin confirmar (muestra upsell); false = sin productos; true = con productos. */
  eventoTieneProductosDisponibles: boolean | null = null;
  nowMs = Date.now();
  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    public router: Router,
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
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.usuario = this.authService.getUsuario();
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
        void this.refrescarPalcosDisponibles();
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
      })
    );

    this.subscriptions.add(
      this.carritoCompraService.evento$.subscribe((evento) => {
        this.evento = evento;
        this.carritoCompraService.clearCuponSiEventoDistinto(evento?.id ?? null);
        const productosCache = this.carritoCompraService.getEventoTieneProductosCache(evento?.id ?? null);
        this.eventoTieneProductosDisponibles = productosCache;
        void this.cargarDisponibilidadProductosUpsell(evento?.id ?? null);
        if (evento?.id) {
          void this.refrescarEvento(evento.id);
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

    void this.validarSesionEnSegundoPlano();
  }

  ngOnDestroy(): void {
    this.stopCountdownTicker();
    this.subscriptions.unsubscribe();
    this.unsubscribeAuth?.();
  }

  get carritoVacio(): boolean {
    return this.carritoCompraService.estaVacio();
  }

  get mostrarInvitacionProductos(): boolean {
    return !!this.evento &&
      this.itemsCompra.length > 0 &&
      this.itemsProductos.length === 0 &&
      this.eventoTieneProductosDisponibles !== false;
  }

  get mostrarCupon(): boolean {
    if (this.itemsCompra.length === 0) return false;
    return !!this.usuario || !!this.authService.getCurrentUser();
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

  aceptarTerminosLicor(): void {
    this.terminosAceptados = true;
    this.cerrarModalTerminosLicor();
    this.alertService.snackbarSuccess('Términos aceptados', 'Ahora puedes finalizar la compra cuando quieras.');
  }

  abrirModalTerminosLicor(): void {
    this.modalTerminosLicor = true;
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

  volverAlEvento(): void {
    if (this.evento?.id) {
      this.router.navigate(['/detalle-evento', this.evento.id], { queryParams: { tab: 'productos' } });
    } else {
      this.irAEventos();
    }
  }

  irAEventos(): void {
    const destino = this.authService.isAdministrador() ? '/probar-compras' : '/eventos-cliente';
    this.router.navigate([destino]);
  }

  async refrescarEvento(eventoId: number): Promise<void> {
    try {
      const evento = await this.eventosService.getEventoById(eventoId);
      this.evento = evento;
      this.carritoCompraService.syncEvento(evento);
    } catch (error) {
      console.error('No se pudo refrescar el evento del carrito:', error);
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
  } | null> {
    try {
      const { data } = await this.supabaseService
        .from('transacciones_checkout')
        .select('id, checkout_url, expires_at, evento_id')
        .eq('cliente_id', clienteId)
        .eq('estado', 'pendiente')
        .eq('es_activa', true)
        .order('fecha_creacion', { ascending: false })
        .limit(20);

      const candidatos = (data || []).map((row) => {
        const expiresAt = row.expires_at ? new Date(String(row.expires_at)).getTime() : Number.NaN;
        const expiro = Number.isFinite(expiresAt) && expiresAt <= Date.now();
        return {
          ...row,
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
    this.checkoutPendienteEnCurso = await this.resolverCheckoutPendiente(clienteId, eventoId);
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
    pendiente: { transaccionCheckoutId: number; checkoutUrl: string | null; expiro: boolean }
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
      window.location.href = pendiente.checkoutUrl;
      return;
    }
    this.router.navigate(['/pago-resultado'], {
      queryParams: { transaccion_checkout_id: pendiente.transaccionCheckoutId }
    });
  }

  ocultarAvisoCheckoutPendiente(): void {
    this.checkoutPendienteEnCurso = null;
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
      const ok = await this.withTimeout(
        this.comprasProductoService.cancelarCheckoutPendiente(pendiente.transaccionCheckoutId),
        12000,
        false
      );
      if (!ok) {
        const siguePendiente = await this.withTimeout(
          this.siguePendienteCheckout(pendiente.transaccionCheckoutId),
          6000,
          true
        );
        if (!siguePendiente) {
          this.checkoutPendienteEnCurso = null;
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem('eventum_pago_pendiente');
          }
          this.alertService.snackbarSuccess('Pago pendiente cancelado', 'Ya puedes crear una compra nueva.');
          return;
        }
        this.alertService.snackbarError(
          'No se pudo cancelar el pago pendiente',
          'Intenta de nuevo en unos segundos o usa "Recuperar pago pendiente".'
        );
        return;
      }

      this.checkoutPendienteEnCurso = null;
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('eventum_pago_pendiente');
      }
      this.alertService.snackbarSuccess('Pago pendiente cancelado', 'Ya puedes crear una compra nueva.');
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
    const agregado = this.carritoCompraService.agregarAlCarrito(item.tipo, item.sesion_cover_id);
    if (!agregado) {
      this.alertService.warning('Stock limitado', `Solo hay ${item.tipo.cantidad_disponibles} boletas disponibles`);
    }
  }

  quitarDelCarrito(item: ItemCarritoEvento): void {
    this.carritoCompraService.quitarDelCarrito(item.tipo.id, item.sesion_cover_id);
  }

  eliminarDelCarrito(item: ItemCarritoEvento): void {
    this.carritoCompraService.eliminarDelCarrito(item.tipo.id, item.sesion_cover_id);
  }

  maxCantidadLinea(item: ItemCarritoEvento): number {
    return item.tipo.cantidad_disponibles ?? 1;
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
    if (!this.cuponAplicado) return 0;
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

  private startCountdownTicker(): void {
    this.stopCountdownTicker();
    this.countdownTimer = setInterval(() => {
      this.nowMs = Date.now();
      this.cdr.detectChanges();
    }, 30000);
  }

  private stopCountdownTicker(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  private async cargarDisponibilidadProductosUpsell(eventoId: number | null): Promise<void> {
    if (!eventoId) {
      this.eventoTieneProductosDisponibles = null;
      this.cdr.detectChanges();
      return;
    }

    try {
      const tieneProductos = await this.productosService.eventoTieneProductos(eventoId);
      this.carritoCompraService.setEventoTieneProductosCache(eventoId, tieneProductos);
      this.eventoTieneProductosDisponibles = tieneProductos;
    } catch {
      if (this.eventoTieneProductosDisponibles === null) {
        this.eventoTieneProductosDisponibles = false;
      }
    } finally {
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

  private async refrescarPalcosDisponibles(): Promise<void> {
    const seq = ++this.refreshPalcosSeq;
    const tiposPalco = this.itemsCompra
      .map((item) => item.tipo)
      .filter((tipo, index, arr) =>
        this.esLineaPalcoMultipersona(tipo) && arr.findIndex((t) => t.id === tipo.id) === index
      );

    const nextDisponibles = new Map<number, Palco[]>();
    const nextCatalogo = new Map<number, Palco[]>();

    for (const tipo of tiposPalco) {
      const result = await this.obtenerPalcosTipoConFallback(tipo.id);
      nextDisponibles.set(tipo.id, result.disponibles);
      nextCatalogo.set(tipo.id, result.catalogo);
    }

    // Evitar condiciones de carrera: solo aplica el resultado del refresco más reciente.
    if (seq !== this.refreshPalcosSeq) {
      return;
    }

    this.palcosDisponiblesPorTipo = nextDisponibles;
    this.palcosCatalogoPorTipo = nextCatalogo;
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

      this.carritoCompraService.vaciarCarrito();
      window.location.href = checkoutUrl;
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

