import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ComprasService } from '../../services/compras.service';
import { BoletasService } from '../../services/boletas.service';
import { AuthService } from '../../services/auth.service';
import { Compra, BoletaComprada, PaginatedResponse } from '../../types';

@Component({
  selector: 'app-mis-compras',
  imports: [CommonModule, RouterModule],
  templateUrl: './mis-compras.html',
  styleUrl: './mis-compras.css',
})
export class MisCompras implements OnInit {
  compras: Compra[] = [];
  comprasConBoletas: { compra: Compra; boletas: BoletaComprada[] }[] = [];
  loading = false;
  total = 0;
  page = 1;
  limit = 10;

  constructor(
    private comprasService: ComprasService,
    private boletasService: BoletasService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadCompras();
  }

  loadCompras() {
    const clienteId = this.authService.getUsuarioId();
    if (!clienteId) {
      console.error('No se pudo identificar el cliente');
      return;
    }

    this.loading = true;
    this.cdr.detectChanges();

    this.comprasService.getCompras({
      cliente_id: clienteId,
      page: this.page,
      limit: this.limit
    }).subscribe({
      next: (response: PaginatedResponse<Compra>) => {
        this.compras = response.data || [];
        this.total = response.total || 0;
        this.loadBoletasPorCompra();
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando compras:', err);
        this.compras = [];
        this.comprasConBoletas = [];
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  loadBoletasPorCompra() {
    this.comprasConBoletas = [];
    
    this.compras.forEach(compra => {
      this.boletasService.getBoletasCompradas({
        compra_id: compra.id,
        limit: 1000
      }).subscribe({
        next: (response: PaginatedResponse<BoletaComprada>) => {
          this.comprasConBoletas.push({
            compra,
            boletas: response.data || []
          });
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Error cargando boletas para compra:', compra.id, err);
          this.comprasConBoletas.push({
            compra,
            boletas: []
          });
          this.cdr.detectChanges();
        }
      });
    });
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', { 
      style: 'currency', 
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  getEstadoPagoLabel(estado?: string): string {
    const estados: { [key: string]: string } = {
      'pendiente': 'Pendiente',
      'completado': 'Completado',
      'fallido': 'Fallido',
      'reembolsado': 'Reembolsado',
      'cancelado': 'Cancelado'
    };
    return estados[estado || 'pendiente'] || estado || 'Pendiente';
  }

  getEstadoCompraLabel(estado?: string): string {
    const estados: { [key: string]: string } = {
      'pendiente': 'Pendiente',
      'confirmada': 'Confirmada',
      'cancelada': 'Cancelada',
      'reembolsada': 'Reembolsada'
    };
    return estados[estado || 'pendiente'] || estado || 'Pendiente';
  }

  getEstadoBoletaLabel(estado?: string): string {
    const estados: { [key: string]: string } = {
      'pendiente': 'Pendiente',
      'usada': 'Usada',
      'cancelada': 'Cancelada',
      'reembolsada': 'Reembolsada'
    };
    return estados[estado || 'pendiente'] || estado || 'Pendiente';
  }

  getEstadoClass(estado?: string): string {
    if (estado === 'completado' || estado === 'confirmada') return 'badge-success';
    if (estado === 'pendiente') return 'badge-warning';
    if (estado === 'cancelada' || estado === 'fallido') return 'badge-danger';
    return 'badge-info';
  }

  Math = Math;
}

