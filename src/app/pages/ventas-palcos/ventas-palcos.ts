import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ComprasService } from '../../services/compras.service';
import { AlertService } from '../../services/alert.service';
import { EventosService } from '../../services/eventos.service';
import { TransaccionesCheckoutService } from '../../services/transacciones-checkout.service';
import { Compra, Evento, PaginatedResponse, TipoEstadoCompra, TipoEstadoPago } from '../../types';
import { DateFormatPipe } from '../../pipes/date-format.pipe';

@Component({
  selector: 'app-ventas-palcos',
  imports: [CommonModule, FormsModule, RouterModule, DateFormatPipe],
  templateUrl: './ventas-palcos.html',
  styleUrl: '../ventas/ventas.css',
})
export class VentasPalcos implements OnInit {
  compras: Compra[] = [];
  comprasConCheckout = new Set<number>();
  deletingCompraId: number | null = null;
  loading = false;
  total = 0;
  page = 1;
  limit = 10;
  estadoPagoFiltro: string | null = null;
  estadoCompraFiltro: string | null = null;
  eventoFiltro: number | null = null;
  eventosFiltro: Evento[] = [];

  showModal = false;
  editingCompra: Compra | null = null;
  formData: Partial<Compra> = {};

  showClienteModal = false;
  showEventoModal = false;
  selectedCliente: Compra['cliente'] | null = null;
  selectedEvento: Compra['evento'] | null = null;

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
    private comprasService: ComprasService,
    private alertService: AlertService,
    private eventosService: EventosService,
    private transaccionesCheckoutService: TransaccionesCheckoutService,
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
      console.error('Error cargando eventos para filtro de ventas de palcos:', error);
      this.eventosFiltro = [];
    } finally {
      this.cdr.detectChanges();
    }
  }

  async loadCompras(): Promise<void> {
    this.loading = true;
    this.cdr.detectChanges();

    try {
      const response: PaginatedResponse<Compra> = await this.comprasService.getCompras({
        page: this.page,
        limit: this.limit,
        evento_id: this.eventoFiltro || undefined,
        estado_pago: this.estadoPagoFiltro || undefined,
        estado_compra: this.estadoCompraFiltro || undefined,
        solo_palcos: true,
      });
      this.compras = response.data || [];
      this.total = response.total || 0;
      await this.cargarDisponibilidadCheckout(this.compras);
    } catch (error) {
      console.error('Error cargando ventas de palcos:', error);
      this.compras = [];
      this.total = 0;
      this.comprasConCheckout = new Set<number>();
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  private async cargarDisponibilidadCheckout(compras: Compra[]): Promise<void> {
    try {
      const ids = compras.map((c) => c.id);
      this.comprasConCheckout = await this.transaccionesCheckoutService.getCompraIdsConCheckout(ids);
    } catch (error) {
      console.warn('No se pudo cargar disponibilidad de checkout para ventas palcos:', error);
      this.comprasConCheckout = new Set<number>();
    }
  }

  tieneCheckout(compra: Compra): boolean {
    return this.comprasConCheckout.has(compra.id);
  }

  onFiltrosChange(): void {
    this.page = 1;
    void this.loadCompras();
  }

  openModal(compra: Compra): void {
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
      const updateData = { ...this.formData };
      delete (updateData as any).cliente;
      delete (updateData as any).evento;
      delete (updateData as any).cupon;
      delete (updateData as any).id;
      delete (updateData as any).fecha_creacion;
      delete (updateData as any).fecha_actualizacion;
      await this.comprasService.updateCompra(this.editingCompra.id, updateData);
      this.closeModal();
      await this.loadCompras();
    } catch (error) {
      console.error('Error guardando venta de palcos:', error);
      this.alertService.error('Error', 'Error al guardar compra');
    }
  }

  getEstadoPagoLabel(estado?: string): string {
    const estadoObj = this.estadosPago.find((e) => e.value === estado);
    return estadoObj?.label || estado || 'Sin estado';
  }

  getEstadoCompraLabel(estado?: string): string {
    const estadoObj = this.estadosCompra.find((e) => e.value === estado);
    return estadoObj?.label || estado || 'Sin estado';
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
    } else {
      let start = Math.max(1, this.page - 2);
      let end = Math.min(totalPages, start + maxPages - 1);

      if (end - start < maxPages - 1) {
        start = Math.max(1, end - maxPages + 1);
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
    }

    return pages;
  }

  goToPage(pageNum: number): void {
    if (pageNum >= 1 && pageNum <= this.getTotalPages()) {
      this.page = pageNum;
      void this.loadCompras();
    }
  }

  openClienteModal(compra: Compra): void {
    this.selectedCliente = compra.cliente || null;
    this.showClienteModal = true;
  }

  closeClienteModal(): void {
    this.showClienteModal = false;
    this.selectedCliente = null;
  }

  openEventoModal(compra: Compra): void {
    this.selectedEvento = compra.evento || null;
    this.showEventoModal = true;
  }

  closeEventoModal(): void {
    this.showEventoModal = false;
    this.selectedEvento = null;
  }

  getClienteNombre(compra: Compra): string {
    if (compra.cliente) {
      const nombre = compra.cliente.nombre || '';
      const apellido = compra.cliente.apellido || '';
      return `${nombre} ${apellido}`.trim() || compra.cliente.email || `Cliente #${compra.cliente_id}`;
    }
    return `Cliente #${compra.cliente_id}`;
  }

  getEventoTitulo(compra: Compra): string {
    return compra.evento?.titulo || `Evento #${compra.evento_id}`;
  }

  categoriaCompra(compra: Compra): 'Palco' | 'Boleta' | 'Mixto' | null {
    const rows = compra.boletas_compradas ?? [];
    if (!rows.length) {
      return null;
    }
    const hasPalco = rows.some((b) => b.grupo_palco_id != null && String(b.grupo_palco_id).length > 0);
    const hasNormal = rows.some((b) => b.grupo_palco_id == null || String(b.grupo_palco_id).length === 0);
    if (hasPalco && hasNormal) {
      return 'Mixto';
    }
    return hasPalco ? 'Palco' : 'Boleta';
  }

  get comprasPalcos(): Compra[] {
    return this.compras.filter((c) => {
      const cat = this.categoriaCompra(c);
      return cat === 'Palco' || cat === 'Mixto';
    });
  }

  tipoCompraLabel(compra: Compra): string {
    const cat = this.categoriaCompra(compra);
    return cat ?? '—';
  }

  private unwrapBoletaEmbed<T>(v: T | T[] | null | undefined): T | undefined {
    if (v == null) {
      return undefined;
    }
    return Array.isArray(v) ? v[0] : v;
  }

  private palcosUnicosPorCompra(compra: Compra): Array<{ nombre: string; numero: string }> {
    const rows = compra.boletas_compradas ?? [];
    const map = new Map<number, { nombre: string; numero: string }>();
    for (const b of rows) {
      if (b.palco_id == null || map.has(b.palco_id)) {
        continue;
      }
      const tipo = this.unwrapBoletaEmbed(b.tipos_boleta);
      const pal = this.unwrapBoletaEmbed(b.palcos);
      const nombre = tipo?.nombre?.trim() || 'Palco';
      const numero = pal?.numero != null ? String(pal.numero) : '—';
      map.set(b.palco_id, { nombre, numero });
    }
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => v);
  }

  palcosNombreLista(compra: Compra): string {
    const items = this.palcosUnicosPorCompra(compra);
    return items.length ? items.map((i) => i.nombre).join(' · ') : '—';
  }

  palcosNumeroLista(compra: Compra): string {
    const items = this.palcosUnicosPorCompra(compra);
    return items.length ? items.map((i) => i.numero).join(' · ') : '—';
  }

  private grupoPalcoParaEliminar(compra: Compra): string | null {
    const rows = compra.boletas_compradas ?? [];
    const hasNormal = rows.some((b) => !b.grupo_palco_id);
    if (hasNormal) {
      return null;
    }
    const grupos = [...new Set(rows.map((b) => b.grupo_palco_id).filter((g): g is string => !!g))];
    if (grupos.length === 1) {
      return grupos[0];
    }
    return null;
  }

  puedeEliminarBoletaVenta(compra: Compra): boolean {
    const pagoCerrado = compra.estado_pago === TipoEstadoPago.COMPLETADO;
    const compraCerrada = compra.estado_compra === TipoEstadoCompra.CONFIRMADA;
    return !(pagoCerrado && compraCerrada);
  }

  mensajeConfirmarEliminar(compra: Compra): string {
    const g = this.grupoPalcoParaEliminar(compra);
    if (g) {
      return (
        '¿Eliminar este palco y todas sus boletas asociadas (mismo grupo)? ' +
        'Si era la única unidad de la compra, también se eliminará el registro de la compra. ' +
        'Esta acción no se puede deshacer.'
      );
    }
    return (
      '¿Eliminar esta compra y todas sus boletas? Se liberarán palcos y se revertirá stock si la venta estaba confirmada. ' +
      'Esta acción no se puede deshacer.'
    );
  }

  async eliminarBoletasVenta(compra: Compra): Promise<void> {
    if (!this.puedeEliminarBoletaVenta(compra)) {
      return;
    }
    if (!confirm(this.mensajeConfirmarEliminar(compra))) {
      return;
    }
    const grupo = this.grupoPalcoParaEliminar(compra);
    this.deletingCompraId = compra.id;
    this.cdr.detectChanges();
    try {
      await this.comprasService.adminEliminarVentaBoletas(compra.id, grupo);
      this.alertService.success('Listo', grupo ? 'Palco / boletas eliminados.' : 'Compra eliminada.');
      await this.loadCompras();
    } catch (e: any) {
      console.error(e);
      this.alertService.error('Error', e?.message || e?.error_description || 'No se pudo eliminar la venta.');
    } finally {
      this.deletingCompraId = null;
      this.cdr.detectChanges();
    }
  }

  Math = Math;
}
