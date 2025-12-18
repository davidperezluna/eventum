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
        await this.comprasService.updateCompra(this.editingCompra.id, this.formData);
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
}
