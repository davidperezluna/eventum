import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { DateFormatPipe } from '../../pipes/date-format.pipe';
import { AlertService } from '../../services/alert.service';
import { ComprasProductoService } from '../../services/compras-producto.service';
import { EventosService } from '../../services/eventos.service';
import { TransaccionesCheckoutService } from '../../services/transacciones-checkout.service';
import {
  CompraProducto,
  Evento,
  PaginatedResponse,
  TipoEstadoCompra,
  TipoEstadoPago,
} from '../../types';

@Component({
  selector: 'app-ventas-productos',
  imports: [CommonModule, FormsModule, RouterModule, DateFormatPipe],
  templateUrl: './ventas-productos.html',
  styleUrl: './ventas-productos.css',
})
export class VentasProductos implements OnInit {
  compras: CompraProducto[] = [];
  comprasProductoConCheckout = new Set<number>();
  loading = false;
  total = 0;
  page = 1;
  limit = 10;

  eventosFiltro: Evento[] = [];
  eventoFiltro: number | null = null;
  estadoPagoFiltro: string | null = null;
  estadoCompraFiltro: string | null = null;
  searchFiltro = '';

  showModal = false;
  editingCompra: CompraProducto | null = null;
  formData: Partial<CompraProducto> = {};

  estadosPago: { value: TipoEstadoPago; label: string }[] = [
    { value: TipoEstadoPago.PENDIENTE, label: 'Pendiente' },
    { value: TipoEstadoPago.COMPLETADO, label: 'Completado' },
    { value: TipoEstadoPago.FALLIDO, label: 'Fallido' },
    { value: TipoEstadoPago.REEMBOLSADO, label: 'Reembolsado' },
    { value: TipoEstadoPago.CANCELADO, label: 'Cancelado' },
  ];

  estadosCompra: { value: TipoEstadoCompra; label: string }[] = [
    { value: TipoEstadoCompra.PENDIENTE, label: 'Pendiente' },
    { value: TipoEstadoCompra.CONFIRMADA, label: 'Confirmada' },
    { value: TipoEstadoCompra.CANCELADA, label: 'Cancelada' },
    { value: TipoEstadoCompra.REEMBOLSADA, label: 'Reembolsada' },
  ];

  constructor(
    private comprasProductoService: ComprasProductoService,
    private transaccionesCheckoutService: TransaccionesCheckoutService,
    private eventosService: EventosService,
    private alertService: AlertService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    void this.cargarEventosFiltro();
    void this.loadCompras();
  }

  async cargarEventosFiltro(): Promise<void> {
    try {
      const response = await this.eventosService.getEventos({
        page: 1,
        limit: 500,
        activo: true,
        sortBy: 'titulo',
        sortOrder: 'asc',
      });
      this.eventosFiltro = response.data || [];
    } catch (error) {
      console.error('Error cargando eventos para filtro de ventas productos:', error);
      this.eventosFiltro = [];
    } finally {
      this.cdr.detectChanges();
    }
  }

  async loadCompras(): Promise<void> {
    this.loading = true;
    this.cdr.detectChanges();

    try {
      const response: PaginatedResponse<CompraProducto> = await this.comprasProductoService.getComprasAdmin({
        page: this.page,
        limit: this.limit,
        evento_id: this.eventoFiltro || undefined,
        estado_pago: this.estadoPagoFiltro || undefined,
        estado_compra: this.estadoCompraFiltro || undefined,
        search: this.searchFiltro.trim() || undefined,
      });
      this.compras = response.data || [];
      this.total = response.total || 0;
      await this.cargarDisponibilidadCheckout(this.compras);
    } catch (error) {
      console.error('Error cargando compras de productos:', error);
      this.compras = [];
      this.total = 0;
      this.comprasProductoConCheckout = new Set<number>();
      this.alertService.error('Error', 'No se pudieron cargar las ventas de productos.');
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  onFiltrosChange(): void {
    this.page = 1;
    void this.loadCompras();
  }

  openModal(compra: CompraProducto): void {
    this.editingCompra = compra;
    this.formData = { ...compra };
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.editingCompra = null;
    this.formData = {};
  }

  async saveCompra(): Promise<void> {
    if (!this.editingCompra) {
      return;
    }
    try {
      const updateData: Partial<CompraProducto> = { ...this.formData };
      delete (updateData as any).eventos;
      delete (updateData as any).compras_productos_items;
      delete (updateData as any).cliente;
      delete (updateData as any).id;
      delete (updateData as any).fecha_compra;
      delete (updateData as any).fecha_confirmacion;
      delete (updateData as any).fecha_cancelacion;

      await this.comprasProductoService.updateCompraAdmin(this.editingCompra.id, updateData);
      this.closeModal();
      await this.loadCompras();
      this.alertService.success('Actualizado', 'Venta de productos actualizada.');
    } catch (error) {
      console.error('Error actualizando compra de productos:', error);
      this.alertService.error('Error', 'No se pudo actualizar la venta de productos.');
    }
  }

  getEstadoPagoLabel(estado?: string): string {
    const estadoObj = this.estadosPago.find((e) => e.value === estado);
    return estadoObj?.label || estado || 'Sin estado';
  }

  private async cargarDisponibilidadCheckout(compras: CompraProducto[]): Promise<void> {
    try {
      const ids = compras.map((c) => c.id);
      this.comprasProductoConCheckout =
        await this.transaccionesCheckoutService.getCompraProductoIdsConCheckout(ids);
    } catch (error) {
      console.warn('No se pudo cargar disponibilidad de checkout para ventas productos:', error);
      this.comprasProductoConCheckout = new Set<number>();
    }
  }

  tieneCheckout(compra: CompraProducto): boolean {
    return this.comprasProductoConCheckout.has(compra.id);
  }

  getEstadoCompraLabel(estado?: string): string {
    const estadoObj = this.estadosCompra.find((e) => e.value === estado);
    return estadoObj?.label || estado || 'Sin estado';
  }

  getClienteNombre(compra: CompraProducto): string {
    const cliente = (compra as CompraProducto & { cliente?: any }).cliente;
    if (!cliente) {
      return `Cliente #${compra.cliente_id}`;
    }
    const nombre = String(cliente.nombre || '').trim();
    const apellido = String(cliente.apellido || '').trim();
    const fullName = [nombre, apellido].filter(Boolean).join(' ').trim();
    return fullName || cliente.email || `Cliente #${compra.cliente_id}`;
  }

  getEventoTitulo(compra: CompraProducto): string {
    return compra.eventos?.titulo || `Evento #${compra.evento_id}`;
  }

  getItemsResumen(compra: CompraProducto): string {
    const items = compra.compras_productos_items || [];
    if (!items.length) {
      return '—';
    }
    return items
      .map((item) => {
        const nombre = item.productos?.nombre || `Producto #${item.producto_id}`;
        return `${nombre} x${item.cantidad}`;
      })
      .join(' · ');
  }

  formatCurrency(value: number | undefined | null): string {
    const numberValue = Number(value || 0);
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(numberValue);
  }

  getTotalPages(): number {
    return Math.ceil(this.total / this.limit);
  }

  getPageNumbers(): number[] {
    const totalPages = this.getTotalPages();
    const pages: number[] = [];
    const maxPages = 5;

    if (totalPages <= maxPages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
      return pages;
    }

    let start = Math.max(1, this.page - 2);
    let end = Math.min(totalPages, start + maxPages - 1);
    if (end - start < maxPages - 1) {
      start = Math.max(1, end - maxPages + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  goToPage(pageNum: number): void {
    if (pageNum >= 1 && pageNum <= this.getTotalPages()) {
      this.page = pageNum;
      void this.loadCompras();
    }
  }

  Math = Math;
}
