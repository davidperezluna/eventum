import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { BoletasService } from '../../services/boletas.service';
import { CarritoCompraService, ItemCarritoEvento, ItemCarritoProducto } from '../../services/carrito-compra.service';
import { ComprasClienteService, ItemCompra } from '../../services/compras-cliente.service';
import { ComprasProductoService } from '../../services/compras-producto.service';
import { CuponesService } from '../../services/cupones.service';
import { AuthService } from '../../services/auth.service';
import { UsuariosService } from '../../services/usuarios.service';
import { AlertService } from '../../services/alert.service';
import { EventosService } from '../../services/eventos.service';
import { SupabaseService } from '../../services/supabase.service';
import { supabaseConfig } from '../../config/supabase.config';
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
  usuario: Usuario | null = null;
  itemsCompra: ItemCarritoEvento[] = [];
  itemsProductos: ItemCarritoProducto[] = [];

  codigoCupon = '';
  cuponAplicado: CuponDescuento | null = null;
  validandoCupon = false;
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
  mapaAmpliado: { url: string; titulo: string } | null = null;
  private subscriptions = new Subscription();

  constructor(
    public router: Router,
    private boletasService: BoletasService,
    private carritoCompraService: CarritoCompraService,
    private comprasClienteService: ComprasClienteService,
    private comprasProductoService: ComprasProductoService,
    private cuponesService: CuponesService,
    private authService: AuthService,
    private usuariosService: UsuariosService,
    private alertService: AlertService,
    private eventosService: EventosService,
    private supabaseService: SupabaseService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
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
        if (evento?.id) {
          void this.refrescarEvento(evento.id);
        }
      })
    );

    this.loadUsuario();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  get carritoVacio(): boolean {
    return !this.evento || this.carritoCompraService.estaVacio();
  }

  tieneLicor(): boolean {
    return this.carritoCompraService.tieneLicorEnCarrito();
  }

  getDisponiblesProducto(producto: Producto): number {
    return producto.cantidad_disponibles ?? Math.max(0, producto.cantidad_total - (producto.cantidad_vendidas ?? 0));
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
    this.modalTerminosLicor = false;
    void this.procesarCompra();
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

  loadUsuario(): void {
    const usuarioId = this.authService.getUsuarioId();
    if (!usuarioId) return;
    void this.loadUsuarioById(usuarioId);
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

  getCantidadEnCarrito(tipo: TipoBoleta): number {
    return this.carritoCompraService.getCantidadEnCarrito(tipo.id);
  }

  agregarAlCarrito(tipo: TipoBoleta): void {
    const agregado = this.carritoCompraService.agregarAlCarrito(tipo);
    if (!agregado) {
      this.alertService.warning('Stock limitado', `Solo hay ${tipo.cantidad_disponibles} boletas disponibles`);
    }
  }

  quitarDelCarrito(tipo: TipoBoleta): void {
    this.carritoCompraService.quitarDelCarrito(tipo.id);
  }

  eliminarDelCarrito(tipo: TipoBoleta): void {
    this.carritoCompraService.eliminarDelCarrito(tipo.id);
  }

  getSubtotalBoletas(): number {
    return this.itemsCompra.reduce((sum, item) => sum + (item.tipo.precio * item.cantidad), 0);
  }

  getSubtotalProductos(): number {
    return this.carritoCompraService.getSubtotalProductos();
  }

  getSubtotal(): number {
    return this.getSubtotalBoletas() + this.getSubtotalProductos();
  }

  getDescuento(): number {
    if (!this.cuponAplicado) return 0;
    return (this.getSubtotalBoletas() * this.cuponAplicado.porcentaje_descuento) / 100;
  }

  getPorcentajeServicio(): number {
    const raw = Number(this.evento?.porcentaje_servicio ?? 0);
    if (!Number.isFinite(raw)) return 0;
    return Math.min(100, Math.max(0, raw));
  }

  getBaseNetaBoletas(): number {
    return Math.max(0, this.getSubtotalBoletas() - this.getDescuento());
  }

  getValorServicio(): number {
    const base = this.getBaseNetaBoletas() + this.getSubtotalProductos();
    const porcentaje = this.getPorcentajeServicio();
    return (base * porcentaje) / 100;
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
    return this.getBaseNetaBoletas() + this.getSubtotalProductos() + this.getValorServicio();
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  async aplicarCupon(): Promise<void> {
    if (!this.codigoCupon || !this.evento) return;
    this.validandoCupon = true;
    try {
      const cupon = await this.cuponesService.validarCupon(this.codigoCupon, this.evento.id);
      if (cupon) {
        this.cuponAplicado = cupon;
        this.alertService.success('¡Cupón aplicado!', `Se aplicó un descuento del ${cupon.porcentaje_descuento}%`);
      } else {
        this.alertService.error('Cupón inválido', 'El código no existe, expiró o alcanzó su límite de usos');
        this.cuponAplicado = null;
      }
    } catch (error) {
      console.error('Error aplicando cupón:', error);
      this.alertService.error('Error', 'No se pudo validar el cupón');
    } finally {
      this.validandoCupon = false;
    }
  }

  quitarCupon(): void {
    this.cuponAplicado = null;
    this.codigoCupon = '';
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
    if (!this.evento || this.carritoCompraService.estaVacio()) {
      this.alertService.warning('Carrito vacío', 'Debes agregar al menos una boleta, palco o producto');
      return;
    }

    if (this.tieneLicor() && !this.terminosAceptados) {
      this.modalTerminosLicor = true;
      return;
    }

    const ahora = new Date();
    const fechaFin = new Date(this.evento.fecha_fin);
    if (fechaFin < ahora || this.evento.estado === TipoEstadoEvento.FINALIZADO || this.evento.estado === TipoEstadoEvento.CANCELADO) {
      this.alertService.error('Evento finalizado', 'Este evento ya no está disponible para compra');
      return;
    }

    const clienteId = this.authService.getUsuarioId();
    if (!clienteId) {
      this.alertService.warning('Inicia sesión para continuar', 'Debes iniciar sesión para completar la compra');
      this.router.navigate(['/login'], { queryParams: { returnUrl: '/carrito' } });
      return;
    }

    for (const item of this.itemsCompra) {
      if (this.esLineaPalcoMultipersona(item.tipo)) {
        const pids = item.palco_ids || [];
        if (pids.length !== item.cantidad || pids.some((x) => x == null)) {
          this.alertService.warning('Palcos incompletos', `Debes seleccionar todos los palcos en "${item.tipo.nombre}"`);
          return;
        }
      }
    }

    const itemsBoletas: ItemCompra[] = this.itemsCompra.map((item) => {
      const base = {
        tipo_boleta_id: item.tipo.id,
        cantidad: item.cantidad,
        precio_unitario: item.tipo.precio
      };
      if (this.esLineaPalcoMultipersona(item.tipo)) {
        return {
          ...base,
          palco_ids: item.palco_ids!.map((id) => id as number)
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
    const pedidoProductos = tieneProductosEnCarrito
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

    try {
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

      if (this.itemsCompra.length > 0) {
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
        if (compraBoletasId) {
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
            compra_producto_id: compraProductosId ?? undefined,
            status: 'APPROVED'
          }
        });
        return;
      }

      const query = new URLSearchParams();
      if (compraBoletasId) query.set('compra_id', String(compraBoletasId));
      const redirectUrl = `${window.location.origin}/pago-resultado?${query.toString()}`;

      const supabaseUrl = supabaseConfig.url;
      const { data: { session } } = await this.supabaseService.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new Error('No se pudo obtener token de autenticación');
      }

      const wompiBody: Record<string, unknown> = {
        amount_in_cents: Math.round(totalPago * 100),
        redirect_url: redirectUrl,
        customer_email: this.usuario?.email || ''
      };

      if (compraBoletasId && pedidoProductos) {
        wompiBody['tipo'] = 'mixto';
        wompiBody['compra_id'] = compraBoletasId;
        wompiBody['pedido_productos'] = pedidoProductos;
      } else if (pedidoProductos) {
        wompiBody['tipo'] = 'productos';
        wompiBody['pedido_productos'] = pedidoProductos;
      } else if (compraBoletasId) {
        wompiBody['compra_id'] = compraBoletasId;
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
        if (compraBoletasId) {
          await this.supabaseService.from('compras').delete().eq('id', compraBoletasId);
        }
        throw new Error(responseData.error || 'Error creando transacción en Wompi');
      }

      const checkoutUrl = responseData.checkout_url || responseData.transaction?.checkout_url;
      if (!checkoutUrl) {
        throw new Error('No se obtuvo URL de checkout');
      }

      this.carritoCompraService.vaciarCarrito();
      window.location.href = checkoutUrl;
    } catch (error: any) {
      console.error('Error procesando compra:', error);
      this.alertService.error('Error al procesar compra', error?.message || 'Error desconocido');
    } finally {
      this.comprando = false;
    }
  }
}

