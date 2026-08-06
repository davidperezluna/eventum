import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ProductosService } from '../../services/productos.service';
import { EventosService } from '../../services/eventos.service';
import { AlertService } from '../../services/alert.service';
import { AuthService } from '../../services/auth.service';
import { Evento, PaginatedResponse, Producto, ProductoFilters } from '../../types';
import { EvNumberInput } from '../../components/ev-number-input/ev-number-input';
import { formatGroupedNumber } from '../../core/number-input-format';

@Component({
  selector: 'app-productos',
  imports: [CommonModule, FormsModule, EvNumberInput],
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

  constructor(
    private productosService: ProductosService,
    private eventosService: EventosService,
    private alertService: AlertService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    const eventoId = Number(this.route.snapshot.queryParamMap.get('eventoId'));
    if (eventoId > 0) {
      this.eventoFiltro = eventoId;
    }
    void this.loadEventos().then(() => this.loadProductos());
  }

  async loadEventos(): Promise<void> {
    try {
      const filters: { page: number; limit: number; activo?: boolean; organizador_id?: number } = {
        page: 1,
        limit: 200,
        activo: undefined,
      };
      if (this.authService.isOrganizador()) {
        const organizadorId = this.authService.getUsuarioId();
        if (organizadorId) {
          filters.organizador_id = organizadorId;
        }
      }
      const res = await this.eventosService.getEventos(filters);
      this.eventos = res.data || [];
      this.cdr.detectChanges();
    } catch (err) {
      console.error(err);
    }
  }

  async loadProductos(): Promise<void> {
    this.loading = true;
    try {
      const filters: ProductoFilters = {
        page: this.page,
        limit: this.limit,
      };
      if (this.eventoFiltro != null) {
        filters.evento_id = this.eventoFiltro;
      } else if (this.authService.isOrganizador()) {
        const eventoIds = this.eventos.map((evento) => evento.id);
        if (eventoIds.length === 0) {
          this.productos = [];
          this.total = 0;
          this.loading = false;
          this.cdr.detectChanges();
          return;
        }
        filters.evento_ids = eventoIds;
      }

      const res: PaginatedResponse<Producto> = await this.productosService.getProductos(filters);
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
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.editingProducto = null;
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
    return `$${formatGroupedNumber(value)}`;
  }
}
