import { Component, Input, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ProductosService } from '../../services/productos.service';
import { CarritoCompraService, ItemCarritoProducto } from '../../services/carrito-compra.service';
import { AlertService } from '../../services/alert.service';
import { Evento, Producto } from '../../types';
import { DateFormatPipe } from '../../pipes/date-format.pipe';

@Component({
  selector: 'app-evento-productos-tab',
  imports: [CommonModule, RouterModule, DateFormatPipe],
  templateUrl: './evento-productos-tab.html',
  styleUrl: './evento-productos-tab.css'
})
export class EventoProductosTab implements OnInit, OnDestroy {
  @Input({ required: true }) evento!: Evento;
  @Input() eventoFinalizado = false;

  productos: Producto[] = [];
  loading = false;
  totalItemsCarrito = 0;

  private destroy$ = new Subject<void>();

  constructor(
    private productosService: ProductosService,
    private carritoCompraService: CarritoCompraService,
    private alertService: AlertService,
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
    this.loadProductos();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async loadProductos(): Promise<void> {
    if (!this.evento?.id) return;
    this.loading = true;
    try {
      this.productos = await this.productosService.getProductosPorEvento(this.evento.id);
    } catch (err) {
      console.error('Error cargando productos:', err);
      this.productos = [];
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

  agregarAlCarrito(producto: Producto): void {
    if (this.eventoFinalizado) {
      this.alertService.warning('Evento finalizado', 'No se pueden comprar productos en un evento finalizado.');
      return;
    }
    const ok = this.carritoCompraService.agregarProductoAlCarrito(producto);
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
}
