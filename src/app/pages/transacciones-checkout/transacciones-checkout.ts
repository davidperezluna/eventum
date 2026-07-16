import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DateFormatPipe } from '../../pipes/date-format.pipe';
import { AlertService } from '../../services/alert.service';
import {
  TransaccionCheckout,
  TransaccionesCheckoutService,
} from '../../services/transacciones-checkout.service';
import { Evento, PaginatedResponse } from '../../types';
import { EventosService } from '../../services/eventos.service';

@Component({
  selector: 'app-transacciones-checkout',
  imports: [CommonModule, FormsModule, DateFormatPipe],
  templateUrl: './transacciones-checkout.html',
  styleUrl: './transacciones-checkout.css',
})
export class TransaccionesCheckout implements OnInit {
  transacciones: TransaccionCheckout[] = [];
  eventosFiltro: Evento[] = [];
  loading = false;
  total = 0;
  page = 1;
  limit = 15;

  eventoFiltro: number | null = null;
  tipoFiltro: string | null = null;
  estadoFiltro: string | null = null;
  searchFiltro = '';
  private nombresTiposBoleta = new Map<number, string>();
  private nombresProductos = new Map<number, string>();
  showTxModal = false;
  selectedTx: TransaccionCheckout | null = null;
  private routeTxId: number | null = null;
  private routeCompraId: number | null = null;
  private routeCompraProductoId: number | null = null;
  private autoOpenIntentHandled = false;

  readonly tipoOpciones = [
    { value: 'boletas', label: 'Boletas' },
    { value: 'cover', label: 'Cover' },
    { value: 'productos', label: 'Productos' },
    { value: 'mixto', label: 'Mixto' },
    { value: 'cover_mixto', label: 'Cover + productos' },
  ];

  readonly estadoOpciones = [
    { value: 'pendiente', label: 'Pendiente' },
    { value: 'aprobada', label: 'Aprobada' },
    { value: 'rechazada', label: 'Rechazada' },
    { value: 'cancelada', label: 'Cancelada' },
    { value: 'expirada', label: 'Expirada' },
    { value: 'error', label: 'Error' },
  ];

  constructor(
    private transaccionesCheckoutService: TransaccionesCheckoutService,
    private eventosService: EventosService,
    private alertService: AlertService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.aplicarFiltrosDesdeRuta();
    void this.cargarEventosFiltro();
    void this.loadTransacciones();
  }

  private aplicarFiltrosDesdeRuta(): void {
    const qp = this.route.snapshot.queryParamMap;
    this.routeTxId = this.toPositiveInt(qp.get('tx_id'));
    this.routeCompraId = this.toPositiveInt(qp.get('compra_id'));
    this.routeCompraProductoId = this.toPositiveInt(qp.get('compra_producto_id'));
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
      console.error('Error cargando eventos para filtro de transacciones:', error);
      this.eventosFiltro = [];
    } finally {
      this.cdr.detectChanges();
    }
  }

  async loadTransacciones(): Promise<void> {
    this.loading = true;
    this.cdr.detectChanges();

    try {
      const response: PaginatedResponse<TransaccionCheckout> =
        await this.transaccionesCheckoutService.getTransacciones({
          page: this.page,
          limit: this.limit,
          tx_id: this.routeTxId || undefined,
          evento_id: this.eventoFiltro || undefined,
          compra_id: this.routeCompraId || undefined,
          compra_producto_id: this.routeCompraProductoId || undefined,
          tipo: this.tipoFiltro || undefined,
          estado: this.estadoFiltro || undefined,
          search: this.searchFiltro.trim() || undefined,
        });
      this.transacciones = response.data || [];
      this.total = response.total || 0;
      await this.cargarCatalogosCompra(this.transacciones);
      this.tryAutoOpenFromRoute();
    } catch (error: any) {
      console.error('Error cargando transacciones checkout:', error);
      this.transacciones = [];
      this.total = 0;
      this.alertService.error(
        'Error',
        error?.message || 'No se pudieron cargar las transacciones checkout.'
      );
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  onFiltrosChange(): void {
    this.page = 1;
    this.clearRouteSpecificFilters();
    void this.loadTransacciones();
  }

  getClienteLabel(tx: TransaccionCheckout): string {
    const cliente = tx.cliente;
    if (!cliente) {
      return `Cliente #${tx.cliente_id}`;
    }
    const nombre = String(cliente.nombre || '').trim();
    const apellido = String(cliente.apellido || '').trim();
    const fullName = [nombre, apellido].filter(Boolean).join(' ').trim();
    return fullName || cliente.email || cliente.documento_identidad || `Cliente #${tx.cliente_id}`;
  }

  getEventoLabel(tx: TransaccionCheckout): string {
    return tx.evento?.titulo || `Evento #${tx.evento_id}`;
  }

  getNumeroTransaccion(tx: TransaccionCheckout): string {
    const boletas = String(tx.compra?.numero_transaccion || '').trim();
    if (boletas) {
      return boletas;
    }
    const cover = String(tx.compra_cover?.numero_transaccion || '').trim();
    if (cover) {
      return cover;
    }
    const producto = String(tx.compra_producto?.numero_pedido || '').trim();
    if (producto) {
      return producto;
    }
    return '—';
  }

  getQueSeCompro(tx: TransaccionCheckout): string {
    const payload = tx.request_payload as Record<string, unknown> | null | undefined;
    const pedidoBoletas = this.asRecord(payload?.['pedido_boletas']);
    const pedidoProductos = this.asRecord(payload?.['pedido_productos']);
    const boletasItems = this.asArray(pedidoBoletas?.['items']);
    const productosItems = this.asArray(pedidoProductos?.['items']);

    const resumenPartes: string[] = [];
    const resumenBoletas = this.resumenItemsBoletas(boletasItems, this.nombresTiposBoleta);
    const resumenProductos = this.resumenItemsProductos(productosItems, this.nombresProductos);

    if (resumenBoletas) {
      resumenPartes.push(resumenBoletas);
    }
    if (resumenProductos) {
      resumenPartes.push(resumenProductos);
    }

    if (resumenPartes.length > 0) {
      return resumenPartes.join(' | ');
    }

    if (tx.tipo === 'cover') {
      return `Compra cover #${tx.compra_id || 'pendiente'}`;
    }
    if (tx.tipo === 'boletas' || tx.compra_id) {
      return `Compra boletas #${tx.compra_id || 'pendiente'}`;
    }
    if (tx.tipo === 'productos' || tx.compra_producto_id) {
      return `Compra productos #${tx.compra_producto_id || 'pendiente'}`;
    }
    return 'Sin detalle en payload';
  }

  getDetalleLista(tx: TransaccionCheckout): string[] {
    const payload = tx.request_payload as Record<string, unknown> | null | undefined;
    const pedidoBoletas = this.asRecord(payload?.['pedido_boletas']);
    const pedidoProductos = this.asRecord(payload?.['pedido_productos']);
    const boletasItems = this.asArray(pedidoBoletas?.['items']);
    const productosItems = this.asArray(pedidoProductos?.['items']);

    const detalle: string[] = [];
    detalle.push(...this.buildDetalleItems(boletasItems, 'tipo_boleta_id', this.nombresTiposBoleta, 'Boleta'));
    detalle.push(...this.buildDetalleItems(productosItems, 'producto_id', this.nombresProductos, 'Producto'));

    if (detalle.length > 0) {
      return detalle;
    }

    if (tx.compra_id) {
      detalle.push(`Compra boletas #${tx.compra_id}`);
    }
    if (tx.compra_producto_id) {
      detalle.push(`Compra productos #${tx.compra_producto_id}`);
    }
    return detalle.length ? detalle : ['Sin detalle en payload'];
  }

  openTxModal(tx: TransaccionCheckout): void {
    this.selectedTx = tx;
    this.showTxModal = true;
  }

  closeTxModal(): void {
    this.showTxModal = false;
    this.selectedTx = null;
  }

  formatJson(value: unknown): string {
    if (!value) {
      return '{}';
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  private tryAutoOpenFromRoute(): void {
    if (this.autoOpenIntentHandled) {
      return;
    }
    if (!this.routeTxId && !this.routeCompraId && !this.routeCompraProductoId) {
      this.autoOpenIntentHandled = true;
      return;
    }
    this.autoOpenIntentHandled = true;
    if (this.transacciones.length > 0) {
      this.openTxModal(this.transacciones[0]);
      return;
    }
    this.alertService.warning('Sin resultados', 'No se encontró transacción para la venta seleccionada.');
  }

  private clearRouteSpecificFilters(): void {
    this.routeTxId = null;
    this.routeCompraId = null;
    this.routeCompraProductoId = null;
  }

  private toPositiveInt(value: string | null): number | null {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  private resumenItemsBoletas(items: unknown[], nombres: Map<number, string>): string {
    if (!items.length) {
      return '';
    }

    let cantidadTotal = 0;
    const porTipo = new Map<number, number>();

    for (const item of items) {
      const row = this.asRecord(item);
      const tipoId = this.toNumber(row?.['tipo_boleta_id']);
      const cantidad = this.toNumber(row?.['cantidad']);
      if (cantidad > 0) {
        cantidadTotal += cantidad;
      }
      if (tipoId > 0 && cantidad > 0) {
        porTipo.set(tipoId, (porTipo.get(tipoId) || 0) + cantidad);
      }
    }

    const tipos = Array.from(porTipo.entries())
      .map(([id, cantidad]) => `${nombres.get(id) || `Tipo #${id}`} x${cantidad}`)
      .join(', ');

    return tipos
      ? `Boletas ${cantidadTotal} (${tipos})`
      : `Boletas ${cantidadTotal || items.length}`;
  }

  private resumenItemsProductos(items: unknown[], nombres: Map<number, string>): string {
    if (!items.length) {
      return '';
    }

    let cantidadTotal = 0;
    const porProducto = new Map<number, number>();

    for (const item of items) {
      const row = this.asRecord(item);
      const productoId = this.toNumber(row?.['producto_id']);
      const cantidad = this.toNumber(row?.['cantidad']);
      if (cantidad > 0) {
        cantidadTotal += cantidad;
      }
      if (productoId > 0 && cantidad > 0) {
        porProducto.set(productoId, (porProducto.get(productoId) || 0) + cantidad);
      }
    }

    const productos = Array.from(porProducto.entries())
      .map(([id, cantidad]) => `${nombres.get(id) || `Producto #${id}`} x${cantidad}`)
      .join(', ');

    return productos
      ? `Productos ${cantidadTotal} (${productos})`
      : `Productos ${cantidadTotal || items.length}`;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private toNumber(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  private buildDetalleItems(
    items: unknown[],
    idField: 'tipo_boleta_id' | 'producto_id',
    nombres: Map<number, string>,
    prefijo: 'Boleta' | 'Producto'
  ): string[] {
    const acumulado = new Map<number, number>();

    for (const item of items) {
      const row = this.asRecord(item);
      const id = this.toNumber(row?.[idField]);
      const cantidad = this.toNumber(row?.['cantidad']);
      if (id > 0 && cantidad > 0) {
        acumulado.set(id, (acumulado.get(id) || 0) + cantidad);
      }
    }

    return Array.from(acumulado.entries()).map(([id, cantidad]) => {
      const nombre = nombres.get(id) || `${prefijo} #${id}`;
      return `${nombre} x${cantidad}`;
    });
  }

  private async cargarCatalogosCompra(transacciones: TransaccionCheckout[]): Promise<void> {
    const tipoIds = new Set<number>();
    const productoIds = new Set<number>();

    for (const tx of transacciones) {
      const payload = tx.request_payload as Record<string, unknown> | null | undefined;
      const pedidoBoletas = this.asRecord(payload?.['pedido_boletas']);
      const pedidoProductos = this.asRecord(payload?.['pedido_productos']);
      const boletasItems = this.asArray(pedidoBoletas?.['items']);
      const productosItems = this.asArray(pedidoProductos?.['items']);

      for (const item of boletasItems) {
        const row = this.asRecord(item);
        const tipoId = this.toNumber(row?.['tipo_boleta_id']);
        if (tipoId > 0) {
          tipoIds.add(tipoId);
        }
      }
      for (const item of productosItems) {
        const row = this.asRecord(item);
        const productoId = this.toNumber(row?.['producto_id']);
        if (productoId > 0) {
          productoIds.add(productoId);
        }
      }
    }

    try {
      const [tiposMap, productosMap] = await Promise.all([
        this.transaccionesCheckoutService.getNombresTiposBoleta(Array.from(tipoIds)),
        this.transaccionesCheckoutService.getNombresProductos(Array.from(productoIds)),
      ]);
      this.nombresTiposBoleta = tiposMap;
      this.nombresProductos = productosMap;
    } catch (error) {
      console.warn('No se pudieron cargar nombres de items para transacciones checkout:', error);
      this.nombresTiposBoleta = new Map<number, string>();
      this.nombresProductos = new Map<number, string>();
    }
  }

  estadoClass(estado: string): string {
    if (estado === 'aprobada') return 'badge-success';
    if (estado === 'pendiente') return 'badge-warning';
    return 'badge-danger';
  }

  tipoClass(tipo: string): string {
    if (tipo === 'boletas') return 'tipo-badge tipo-badge--boletas';
    if (tipo === 'cover') return 'tipo-badge tipo-badge--cover';
    if (tipo === 'productos') return 'tipo-badge tipo-badge--productos';
    if (tipo === 'cover_mixto') return 'tipo-badge tipo-badge--cover-mixto';
    return 'tipo-badge tipo-badge--mixto';
  }

  formatCurrency(value: number | undefined | null, moneda?: string | null): string {
    const numberValue = Number(value || 0);
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: moneda || 'COP',
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
      void this.loadTransacciones();
    }
  }

  Math = Math;
}
