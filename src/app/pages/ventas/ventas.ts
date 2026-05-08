import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { ComprasService } from '../../services/compras.service';
import { AlertService } from '../../services/alert.service';
import { Compra, PaginatedResponse, TipoEstadoPago, TipoEstadoCompra, MetodoPago } from '../../types';
import { DateFormatPipe } from '../../pipes/date-format.pipe';

@Component({
  selector: 'app-ventas',
  imports: [CommonModule, FormsModule, DateFormatPipe],
  templateUrl: './ventas.html',
  styleUrl: './ventas.css',
})
export class Ventas implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  compras: Compra[] = [];
  deletingCompraId: number | null = null;
  loading = false;
  total = 0;
  page = 1;
  limit = 10;
  estadoPagoFiltro: string | null = null;
  estadoCompraFiltro: string | null = null;

  showModal = false;
  editingCompra: Compra | null = null;
  formData: Partial<Compra> = {};
  
  // Modales para mostrar detalles
  showClienteModal = false;
  showEventoModal = false;
  selectedCliente: Compra['cliente'] | null = null;
  selectedEvento: Compra['evento'] | null = null;

  estadosPago: { value: TipoEstadoPago; label: string }[] = [
    { value: TipoEstadoPago.PENDIENTE, label: 'Pendiente' },
    { value: TipoEstadoPago.COMPLETADO, label: 'Completado' },
    { value: TipoEstadoPago.FALLIDO, label: 'Fallido' },
    { value: TipoEstadoPago.REEMBOLSADO, label: 'Reembolsado' },
    { value: TipoEstadoPago.CANCELADO, label: 'Cancelado' }
  ];

  estadosCompra: { value: TipoEstadoCompra; label: string }[] = [
    { value: TipoEstadoCompra.PENDIENTE, label: 'Pendiente' },
    { value: TipoEstadoCompra.CONFIRMADA, label: 'Confirmada' },
    { value: TipoEstadoCompra.CANCELADA, label: 'Cancelada' },
    { value: TipoEstadoCompra.REEMBOLSADA, label: 'Reembolsada' }
  ];

  constructor(
    private comprasService: ComprasService,
    private alertService: AlertService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadCompras();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadCompras() {
    console.log('loadCompras llamado');
    this.loading = true;
    this.cdr.detectChanges();
    
    this.loadComprasInternal();
  }

  private async loadComprasInternal() {
    try {
      const response: PaginatedResponse<Compra> = await this.comprasService.getCompras({
        page: this.page,
        limit: this.limit,
        estado_pago: this.estadoPagoFiltro || undefined,
        estado_compra: this.estadoCompraFiltro || undefined
      });
      console.log('Response recibida en ventas:', response);
      this.compras = response.data || [];
      this.total = response.total || 0;
      this.loading = false;
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando compras:', err);
      this.compras = [];
      this.total = 0;
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  openModal(compra: Compra) {
    this.editingCompra = compra;
    this.formData = { ...compra };
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
    this.editingCompra = null;
    this.formData = {};
  }

  async saveCompra() {
    if (this.editingCompra) {
      try {
        // Limpiar datos que no deben enviarse a la BD
        const updateData = { ...this.formData };
        delete (updateData as any).cliente;
        delete (updateData as any).evento;
        delete (updateData as any).cupon; // Eliminar el objeto cupon del join
        delete (updateData as any).id;
        delete (updateData as any).fecha_creacion;
        delete (updateData as any).fecha_actualizacion;

        await this.comprasService.updateCompra(this.editingCompra.id, updateData);
        this.closeModal();
        this.loadCompras();
      } catch (err) {
        console.error('Error guardando compra:', err);
        this.alertService.error('Error', 'Error al guardar compra');
      }
    }
  }

  getEstadoPagoLabel(estado?: string): string {
    const estadoObj = this.estadosPago.find(e => e.value === estado);
    return estadoObj?.label || estado || 'Sin estado';
  }

  getEstadoCompraLabel(estado?: string): string {
    const estadoObj = this.estadosCompra.find(e => e.value === estado);
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

  goToPage(pageNum: number) {
    if (pageNum >= 1 && pageNum <= this.getTotalPages()) {
      this.page = pageNum;
      this.loadCompras();
    }
  }

  Math = Math;

  // Métodos para mostrar detalles
  openClienteModal(compra: Compra) {
    this.selectedCliente = compra.cliente || null;
    this.showClienteModal = true;
  }

  closeClienteModal() {
    this.showClienteModal = false;
    this.selectedCliente = null;
  }

  openEventoModal(compra: Compra) {
    this.selectedEvento = compra.evento || null;
    this.showEventoModal = true;
  }

  closeEventoModal() {
    this.showEventoModal = false;
    this.selectedEvento = null;
  }

  // Helper para obtener nombre completo del cliente
  getClienteNombre(compra: Compra): string {
    if (compra.cliente) {
      const nombre = compra.cliente.nombre || '';
      const apellido = compra.cliente.apellido || '';
      return `${nombre} ${apellido}`.trim() || compra.cliente.email || `Cliente #${compra.cliente_id}`;
    }
    return `Cliente #${compra.cliente_id}`;
  }

  // Helper para obtener título del evento
  getEventoTitulo(compra: Compra): string {
    return compra.evento?.titulo || `Evento #${compra.evento_id}`;
  }

  /**
   * Clasificación por líneas de `boletas_compradas`.
   * `null` = compra sin líneas cargadas (ej. sin join); se muestra en tabla boletas con tipo "—".
   */
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

  /** Ventas con líneas de palco (incluye mixtas; para no duplicar la misma compra en ambas tablas). */
  get comprasPalcos(): Compra[] {
    return this.compras.filter((c) => {
      const cat = this.categoriaCompra(c);
      return cat === 'Palco' || cat === 'Mixto';
    });
  }

  /** Solo ventas de entradas generales (sin líneas de palco en la compra). */
  get comprasBoletas(): Compra[] {
    return this.compras.filter((c) => {
      const cat = this.categoriaCompra(c);
      return cat === 'Boleta' || cat === null;
    });
  }

  /** Etiqueta tipo para badges (tabla palcos). */
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

  /** Una entrada por `palco_id` distinto (tipo de boleta / palco + número físico). */
  private palcosUnicosPorCompra(compra: Compra): Array<{ nombre: string; numero: string }> {
    const rows = compra.boletas_compradas ?? [];
    const map = new Map<number, { nombre: string; numero: string }>();
    for (const b of rows) {
      if (b.palco_id == null) {
        continue;
      }
      if (map.has(b.palco_id)) {
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

  /** Texto para columna “Nombre palco” (tipo de entrada numerada). */
  palcosNombreLista(compra: Compra): string {
    const items = this.palcosUnicosPorCompra(compra);
    return items.length ? items.map((i) => i.nombre).join(' · ') : '—';
  }

  /** Texto para columna “Nº palco”. */
  palcosNumeroLista(compra: Compra): string {
    const items = this.palcosUnicosPorCompra(compra);
    return items.length ? items.map((i) => i.numero).join(' · ') : '—';
  }

  /**
   * Un solo grupo de palco y sin boletas “sueltas” → se puede borrar solo ese grupo.
   * En cualquier otro caso se elimina la compra completa.
   */
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

  /** Ventas cerradas (pagadas y confirmadas): no se muestra eliminar en UI. */
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

  async eliminarBoletasVenta(compra: Compra) {
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
      await this.loadComprasInternal();
    } catch (e: any) {
      console.error(e);
      this.alertService.error(
        'Error',
        e?.message || e?.error_description || 'No se pudo eliminar la venta.'
      );
    } finally {
      this.deletingCompraId = null;
      this.cdr.detectChanges();
    }
  }
}
