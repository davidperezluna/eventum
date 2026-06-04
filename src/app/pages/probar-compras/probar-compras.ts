import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { EventosService } from '../../services/eventos.service';
import { CategoriasService } from '../../services/categorias.service';
import { CarritoCompraService } from '../../services/carrito-compra.service';
import { ProductosService } from '../../services/productos.service';
import { Evento, CategoriaEvento, TipoEstadoEvento } from '../../types';
import { DateFormatPipe } from '../../pipes/date-format.pipe';

@Component({
  selector: 'app-probar-compras',
  imports: [CommonModule, RouterModule, FormsModule, DateFormatPipe],
  templateUrl: './probar-compras.html',
  styleUrl: './probar-compras.css',
})
export class ProbarCompras implements OnInit, OnDestroy {
  eventos: Evento[] = [];
  eventosFiltrados: Evento[] = [];
  categorias: CategoriaEvento[] = [];
  loading = false;
  loadError: string | null = null;
  searchTerm = '';
  categoriaFiltro: number | null = null;
  totalItemsCarrito = 0;
  resumenProductosPorEvento = new Map<number, { cantidad: number; precioMinimo: number }>();

  private carritoSubscription?: Subscription;

  constructor(
    private eventosService: EventosService,
    private categoriasService: CategoriasService,
    private carritoCompraService: CarritoCompraService,
    private productosService: ProductosService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.carritoSubscription = this.carritoCompraService.totalItems$.subscribe((total) => {
      this.totalItemsCarrito = total;
      this.cdr.detectChanges();
    });
    void this.loadData();
  }

  ngOnDestroy(): void {
    this.carritoSubscription?.unsubscribe();
  }

  async loadData(): Promise<void> {
    this.loading = true;
    this.cdr.detectChanges();

    try {
      await Promise.all([this.loadCategorias(), this.loadEventos()]);
      this.aplicarFiltros();
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  private async loadCategorias(): Promise<void> {
    try {
      const response = await this.categoriasService.getCategorias({ limit: 100, activo: true });
      this.categorias = response.data || [];
    } catch (err) {
      console.error('Error cargando categorías:', err);
      this.categorias = [];
    }
  }

  private async loadEventos(): Promise<void> {
    this.loadError = null;
    try {
      const crudos = await this.fetchEventosParaPrueba();
      this.eventos = crudos.filter((evento) => this.esEventoProbableCompra(evento));
      await this.cargarResumenProductosEventos();
      if (this.eventos.length === 0) {
        this.loadError = crudos.length === 0
          ? 'No se encontraron eventos en la base de datos para este usuario.'
          : 'Los eventos visibles están finalizados o cancelados.';
      }
    } catch (err) {
      console.error('Error cargando eventos:', err);
      this.eventos = [];
      this.resumenProductosPorEvento = new Map();
      this.loadError = 'No se pudieron cargar los eventos. Revisa la consola o intenta recargar.';
    }
  }

  /** Admin: incluye inactivos/ocultos; excluye solo finalizados/cancelados. */
  private esEventoProbableCompra(evento: Evento): boolean {
    const estado = String(evento.estado || '').toLowerCase();
    return estado !== TipoEstadoEvento.FINALIZADO && estado !== TipoEstadoEvento.CANCELADO;
  }

  private async fetchEventosParaPrueba(): Promise<Evento[]> {
    const base = {
      limit: 100,
      sortBy: 'fecha_inicio' as const,
      sortOrder: 'desc' as const,
    };

    const intentos: Array<Record<string, unknown>> = [
      {},
      { activo: true, estado: TipoEstadoEvento.PUBLICADO },
      { activo: true },
      { activo: false },
    ];

    const porId = new Map<number, Evento>();

    for (const extra of intentos) {
      try {
        const response = await this.eventosService.getEventos({ ...base, ...extra });
        for (const evento of response.data || []) {
          porId.set(evento.id, evento);
        }
      } catch (err) {
        console.warn('probar-compras: intento de carga de eventos falló', extra, err);
      }
    }

    return [...porId.values()].sort((a, b) => {
      const fa = a.fecha_inicio ? new Date(a.fecha_inicio).getTime() : 0;
      const fb = b.fecha_inicio ? new Date(b.fecha_inicio).getTime() : 0;
      return fb - fa;
    });
  }

  onFiltrosChange(): void {
    this.aplicarFiltros();
  }

  private aplicarFiltros(): void {
    let filtrados = [...this.eventos];
    const search = this.searchTerm.trim().toLowerCase();

    if (search) {
      filtrados = filtrados.filter((evento) => {
        const titulo = (evento.titulo || '').toLowerCase();
        const descripcion = (evento.descripcion || '').toLowerCase();
        return titulo.includes(search) || descripcion.includes(search);
      });
    }

    if (this.categoriaFiltro) {
      filtrados = filtrados.filter((evento) => evento.categoria_id === this.categoriaFiltro);
    }

    this.eventosFiltrados = filtrados;
  }

  formatCurrency(value: number | undefined): string {
    if (!value) return 'Gratis';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }

  getImageUrl(evento: Evento): string {
    return evento.imagen_principal || '/assets/placeholder-event.jpg';
  }

  etiquetaEstado(evento: Evento): string {
    const estado = (evento.estado || '').replace(/_/g, ' ');
    return estado ? estado.charAt(0).toUpperCase() + estado.slice(1) : 'Sin estado';
  }

  trackByEventoId(_: number, evento: Evento): number {
    return evento.id;
  }

  private async cargarResumenProductosEventos(): Promise<void> {
    const ids = this.eventos.map((evento) => evento.id);
    if (ids.length === 0) {
      this.resumenProductosPorEvento = new Map();
      return;
    }
    try {
      this.resumenProductosPorEvento = await this.productosService.getResumenProductosPorEvento(ids);
    } catch (error) {
      console.warn('No se pudo cargar resumen de productos por evento (probar-compras):', error);
      this.resumenProductosPorEvento = new Map();
    }
  }

  tieneProductosEvento(eventoId: number): boolean {
    return this.resumenProductosPorEvento.has(eventoId);
  }

  getCantidadProductosEvento(eventoId: number): number {
    return this.resumenProductosPorEvento.get(eventoId)?.cantidad ?? 0;
  }

  getPrecioMinimoProductoEvento(eventoId: number): number {
    return this.resumenProductosPorEvento.get(eventoId)?.precioMinimo ?? 0;
  }

  getProductosChipLabel(evento: Evento): string {
    const cantidad = this.getCantidadProductosEvento(evento.id);
    const sufijo = cantidad === 1 ? 'producto' : 'productos';
    const estadoLabel = this.precioEventoActivo(evento) ? 'Precio activo' : 'Preventa';
    const precioMinimo = this.getPrecioMinimoProductoEvento(evento.id);
    return `${estadoLabel} · ${cantidad} ${sufijo} · Desde ${this.formatCurrency(precioMinimo)}`;
  }

  precioEventoActivo(evento: Evento): boolean {
    if (!evento.fecha_inicio) return false;
    return new Date(evento.fecha_inicio).getTime() <= Date.now();
  }

}
