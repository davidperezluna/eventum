import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductosService } from '../../services/productos.service';
import { EventosService } from '../../services/eventos.service';
import { AlertService } from '../../services/alert.service';
import { Evento, PaginatedResponse, Producto } from '../../types';

@Component({
  selector: 'app-productos',
  imports: [CommonModule, FormsModule],
  templateUrl: './productos.html',
  styleUrl: './productos.css'
})
export class Productos implements OnInit {
  productos: Producto[] = [];
  eventos: Evento[] = [];
  loading = false;
  total = 0;
  page = 1;
  limit = 20;
  eventoFiltro: number | null = null;

  showModal = false;
  editingProducto: Producto | null = null;
  formData: Partial<Producto> = { activo: true, es_licor: false, cantidad_total: 0, orden: 0 };
  precioPreventaInput = '';
  precioEventoInput = '';

  constructor(
    private productosService: ProductosService,
    private eventosService: EventosService,
    private alertService: AlertService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    void this.loadEventos();
    void this.loadProductos();
  }

  async loadEventos(): Promise<void> {
    try {
      const res = await this.eventosService.getEventos({ page: 1, limit: 200, activo: undefined });
      this.eventos = res.data || [];
      this.cdr.detectChanges();
    } catch (err) {
      console.error(err);
    }
  }

  async loadProductos(): Promise<void> {
    this.loading = true;
    try {
      const res: PaginatedResponse<Producto> = await this.productosService.getProductos({
        page: this.page,
        limit: this.limit,
        evento_id: this.eventoFiltro ?? undefined
      });
      this.productos = res.data;
      this.total = res.total;
    } catch (err) {
      console.error(err);
      this.alertService.error('Error', 'No se pudieron cargar los productos.');
      this.productos = [];
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  onFiltroChange(): void {
    this.page = 1;
    void this.loadProductos();
  }

  openModal(producto?: Producto): void {
    this.editingProducto = producto ?? null;
    this.formData = producto
      ? { ...producto }
      : { activo: true, es_licor: false, cantidad_total: 0, cantidad_vendidas: 0, orden: 0, precio: 0, precio_evento: 0 };
    this.precioPreventaInput = this.formatMiles(this.formData.precio);
    this.precioEventoInput = this.formatMiles(this.formData.precio_evento);
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.editingProducto = null;
    this.precioPreventaInput = '';
    this.precioEventoInput = '';
  }

  async saveProducto(): Promise<void> {
    if (!this.formData.evento_id || !this.formData.nombre?.trim()) {
      this.alertService.warning('Datos incompletos', 'Evento y nombre son obligatorios.');
      return;
    }

    const precioPreventa = Number(this.formData.precio ?? 0);
    const precioEvento = Number(this.formData.precio_evento ?? 0);
    if (!Number.isFinite(precioPreventa) || precioPreventa < 0 || !Number.isFinite(precioEvento) || precioEvento < 0) {
      this.alertService.warning('Precio inválido', 'Los precios deben ser números iguales o mayores a 0.');
      return;
    }

    try {
      if (this.editingProducto) {
        await this.productosService.updateProducto(this.editingProducto.id, this.formData);
        this.alertService.success('Actualizado', 'Producto actualizado.');
      } else {
        await this.productosService.createProducto(this.formData);
        this.alertService.success('Creado', 'Producto creado.');
      }
      this.closeModal();
      await this.loadProductos();
    } catch (err) {
      console.error(err);
      this.alertService.error('Error', 'No se pudo guardar el producto.');
    }
  }

  async deleteProducto(producto: Producto): Promise<void> {
    if (!confirm(`¿Eliminar "${producto.nombre}"?`)) return;
    try {
      await this.productosService.deleteProducto(producto.id);
      this.alertService.success('Eliminado', 'Producto eliminado.');
      await this.loadProductos();
    } catch (err) {
      console.error(err);
      this.alertService.error('Error', 'No se pudo eliminar. Puede tener ventas asociadas.');
    }
  }

  getEventoTitulo(eventoId: number): string {
    return this.eventos.find((e) => e.id === eventoId)?.titulo ?? `Evento #${eventoId}`;
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  onPrecioInputChange(tipo: 'preventa' | 'evento', rawValue: string): void {
    const digits = (rawValue ?? '').replace(/\D/g, '');
    const formatted = this.formatMilesFromDigits(digits);

    if (tipo === 'preventa') {
      this.precioPreventaInput = formatted;
      this.formData.precio = digits.length > 0 ? Number(digits) : 0;
      return;
    }

    this.precioEventoInput = formatted;
    this.formData.precio_evento = digits.length > 0 ? Number(digits) : undefined;
  }

  private formatMiles(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
      return '';
    }
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      useGrouping: true
    }).format(Number(value));
  }

  private formatMilesFromDigits(digits: string): string {
    if (!digits) return '';
    const numeric = Number(digits);
    if (!Number.isFinite(numeric)) return '';
    return this.formatMiles(numeric);
  }
}
