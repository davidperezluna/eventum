import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComprasService } from '../../services/compras.service';
import { Compra, PaginatedResponse, TipoEstadoPago, TipoEstadoCompra, MetodoPago } from '../../types';

@Component({
  selector: 'app-ventas',
  imports: [CommonModule, FormsModule],
  templateUrl: './ventas.html',
  styleUrl: './ventas.css',
})
export class Ventas implements OnInit {
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
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadCompras();
  }

  loadCompras() {
    console.log('loadCompras llamado');
    this.loading = true;
    this.cdr.detectChanges();
    
    this.comprasService.getCompras({
      page: this.page,
      limit: this.limit,
      estado_pago: this.estadoPagoFiltro || undefined,
      estado_compra: this.estadoCompraFiltro || undefined
    }).subscribe({
      next: (response: PaginatedResponse<Compra>) => {
        console.log('Response recibida en ventas:', response);
        this.compras = response.data || [];
        this.total = response.total || 0;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando compras:', err);
        this.loading = false;
        this.compras = [];
        this.total = 0;
        this.cdr.detectChanges();
      },
      complete: () => {
        console.log('Observable completado en ventas');
        this.cdr.detectChanges();
      }
    });
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

  saveCompra() {
    if (this.editingCompra) {
      this.comprasService.updateCompra(this.editingCompra.id, this.formData).subscribe({
        next: () => {
          this.closeModal();
          this.loadCompras();
        },
        error: (err) => {
          console.error('Error guardando compra:', err);
          alert('Error al guardar compra');
        }
      });
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

  Math = Math;
}
