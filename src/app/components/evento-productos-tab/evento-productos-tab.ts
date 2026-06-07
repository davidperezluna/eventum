import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ProductosService } from '../../services/productos.service';
import { CarritoCompraService, ItemCarritoProducto } from '../../services/carrito-compra.service';
import { AlertService } from '../../services/alert.service';
import { Evento, Producto } from '../../types';
import { DateFormatPipe } from '../../pipes/date-format.pipe';
import { resolverConflictoEventoAntesDeAgregar } from '../../core/carrito-conflicto';
import { ClientConfirmDialogService } from '../../services/client-confirm-dialog.service';

@Component({
  selector: 'app-evento-productos-tab',
  imports: [CommonModule, RouterModule, DateFormatPipe],
  templateUrl: './evento-productos-tab.html',
  styleUrl: './evento-productos-tab.css'
})
export class EventoProductosTab implements OnInit, OnDestroy {
  @Input({ required: true }) evento!: Evento;
  @Input() eventoFinalizado = false;
  @Input() productosIniciales: Producto[] = [];
  @Input() refrescoSilenciosoInicial = false;
  @Output() productosActualizados = new EventEmitter<Producto[]>();

  productos: Producto[] = [];
  loading = false;
  totalItemsCarrito = 0;
  private productosCargados = false;
  nowMs = Date.now();
  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private productosService: ProductosService,
    private carritoCompraService: CarritoCompraService,
    private alertService: AlertService,
    private clientConfirmDialog: ClientConfirmDialogService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.carritoCompraService.syncEvento(this.evento);
    this.carritoCompraService.totalItems$
      .pipe(takeUntil(this.destroy$))
      .subscribe((total) => {
        this.totalItemsCarrito = total;
        this.cdr.detectChanges();
      });

    if (this.productosIniciales.length > 0) {
      this.productos = [...this.productosIniciales];
      this.productosCargados = true;
      this.cdr.detectChanges();
    }

    this.startCountdownTicker();
    this.loadProductos({ background: this.refrescoSilenciosoInicial || this.productosCargados });
  }

  ngOnDestroy(): void {
    this.stopCountdownTicker();
    this.destroy$.next();
    this.destroy$.complete();
  }

  async loadProductos(options?: { background?: boolean; force?: boolean }): Promise<void> {
    if (!this.evento?.id) return;
    const background = options?.background ?? false;
    const force = options?.force ?? false;
    if (!force && this.productosCargados && !background) return;

    this.loading = !background;
    try {
      this.productos = await this.productosService.getProductosPorEvento(this.evento.id);
      this.productosCargados = true;
      this.productosActualizados.emit([...this.productos]);
    } catch (err) {
      console.error('Error cargando productos:', err);
      if (!background) {
        this.productos = [];
      }
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  tieneExistencias(producto: Producto): boolean {
    const disp = producto.cantidad_disponibles ?? Math.max(0, producto.cantidad_total - (producto.cantidad_vendidas ?? 0));
    return disp > 0;
  }

  getCantidadEnCarrito(productoId: number): number {
    return this.carritoCompraService.getCantidadProductoEnCarrito(productoId);
  }

  getDisponibles(producto: Producto): number {
    return producto.cantidad_disponibles ?? Math.max(0, producto.cantidad_total - (producto.cantidad_vendidas ?? 0));
  }

  precioEventoVigente(): boolean {
    if (!this.evento?.fecha_inicio) return false;
    return new Date(this.evento.fecha_inicio).getTime() <= Date.now();
  }

  getPrecioEvento(producto: Producto): number {
    const precioEvento = Number(producto.precio_evento ?? producto.precio);
    return Number.isFinite(precioEvento) && precioEvento >= 0 ? precioEvento : Number(producto.precio ?? 0);
  }

  getPrecioPreventa(producto: Producto): number {
    const precioPreventa = Number(producto.precio ?? 0);
    return Number.isFinite(precioPreventa) && precioPreventa >= 0 ? precioPreventa : 0;
  }

  getPrecioVigente(producto: Producto): number {
    if (this.precioEventoVigente()) {
      return this.getPrecioEvento(producto);
    }
    return this.getPrecioPreventa(producto);
  }

  tienePrecioDiferenciado(producto: Producto): boolean {
    return this.getPrecioEvento(producto) !== this.getPrecioPreventa(producto);
  }

  getPrecioReferencia(producto: Producto): number {
    return this.precioEventoVigente() ? this.getPrecioPreventa(producto) : this.getPrecioEvento(producto);
  }

  getAhorroUnitario(producto: Producto): number {
    if (this.precioEventoVigente()) return 0;
    return Math.max(0, this.getPrecioEvento(producto) - this.getPrecioPreventa(producto));
  }

  getEstadoPrecioLabel(): 'Preventa' | 'En evento' {
    return this.precioEventoVigente() ? 'En evento' : 'Preventa';
  }

  preventaActiva(): boolean {
    if (!this.evento?.fecha_inicio) return false;
    return new Date(this.evento.fecha_inicio).getTime() > this.nowMs;
  }

  shouldShowPreventaHint(): boolean {
    if (!this.preventaUrgente()) return false;
    return this.productos.some((producto) => this.getAhorroUnitario(producto) > 0);
  }

  getPrecioEstadoHintLabel(): string {
    if (this.preventaActiva()) {
      return `Preventa activa${this.getPreventaCountdownLabel() ? ' · ' + this.getPreventaCountdownLabel() : ''}`;
    }
    return 'Precio en evento activo';
  }

  getPreventaCountdownLabel(): string {
    if (!this.preventaActiva() || !this.evento?.fecha_inicio) return '';
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

  preventaUrgente(): boolean {
    if (!this.preventaActiva() || !this.evento?.fecha_inicio) return false;
    const targetMs = new Date(this.evento.fecha_inicio).getTime();
    return targetMs - this.nowMs <= 24 * 60 * 60 * 1000;
  }

  async agregarAlCarrito(producto: Producto): Promise<void> {
    if (this.eventoFinalizado) {
      this.alertService.warning('Evento finalizado', 'No se pueden comprar productos en un evento finalizado.');
      return;
    }
    const puedeContinuar = await resolverConflictoEventoAntesDeAgregar(
      this.clientConfirmDialog,
      this.carritoCompraService,
      this.evento?.titulo ?? 'este evento',
    );
    if (!puedeContinuar) {
      return;
    }
    if (this.evento) {
      this.carritoCompraService.syncEvento(this.evento);
    }
    const productoConPrecioVigente: Producto = {
      ...producto,
      precio_preventa: this.getPrecioPreventa(producto),
      precio_evento: this.getPrecioEvento(producto),
      precio: this.getPrecioVigente(producto),
    };
    const ok = this.carritoCompraService.agregarProductoAlCarrito(productoConPrecioVigente);
    if (!ok) {
      this.alertService.warning('Sin stock', 'No hay más unidades disponibles de este producto.');
    }
  }

  quitarDelCarrito(producto: Producto): void {
    this.carritoCompraService.quitarProductoDelCarrito(producto.id);
  }

  eliminarDelCarrito(producto: Producto): void {
    this.carritoCompraService.eliminarProductoDelCarrito(producto.id);
  }

  getTotalCarrito(): number {
    const base = this.carritoCompraService.getSubtotalCombinado();
    const pct = Math.min(100, Math.max(0, Number(this.evento?.porcentaje_servicio ?? 0)));
    return base + (base * pct) / 100;
  }

  irACarrito(): void {
    this.router.navigate(['/carrito']);
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
}
