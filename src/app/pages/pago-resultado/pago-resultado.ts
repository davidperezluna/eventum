import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ComprasClienteService } from '../../services/compras-cliente.service';
import { Compra } from '../../types';

@Component({
  selector: 'app-pago-resultado',
  imports: [CommonModule, RouterModule],
  templateUrl: './pago-resultado.html',
  styleUrl: './pago-resultado.css',
})
export class PagoResultado implements OnInit {
  compraId: number | null = null;
  compra: Compra | null = null;
  loading = true;
  error: string | null = null;

  constructor(
    private route: ActivatedRoute,
    public router: Router,
    private comprasClienteService: ComprasClienteService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.compraId = params['compra_id'] ? Number(params['compra_id']) : null;
      if (this.compraId) {
        this.verificarEstadoCompra();
      } else {
        this.error = 'No se proporcionó un ID de compra';
        this.loading = false;
      }
    });
  }

  verificarEstadoCompra() {
    if (!this.compraId) return;

    // Esperar un momento para que el webhook procese
    setTimeout(() => {
      this.comprasClienteService.getCompraById(this.compraId!).subscribe({
        next: (compra) => {
          this.compra = compra;
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Error cargando compra:', err);
          this.error = 'Error al cargar la información de la compra';
          this.loading = false;
          this.cdr.detectChanges();
        }
      });
    }, 2000); // Esperar 2 segundos para que el webhook procese
  }

  getEstadoPagoLabel(): string {
    if (!this.compra) return '';
    switch (this.compra.estado_pago) {
      case 'completado': return 'Pago Completado';
      case 'pendiente': return 'Pago Pendiente';
      case 'fallido': return 'Pago Fallido';
      default: return 'Estado Desconocido';
    }
  }

  getEstadoPagoClass(): string {
    if (!this.compra) return '';
    switch (this.compra.estado_pago) {
      case 'completado': return 'success';
      case 'pendiente': return 'warning';
      case 'fallido': return 'error';
      default: return '';
    }
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }
}

