import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { CarritoCompraService } from '../../services/carrito-compra.service';
import { COMPRA_COPY } from '../../core/compra-copy';

export const WOMPI_CHECKOUT_STORAGE_KEY = 'eventum_wompi_checkout';

export interface WompiCheckoutPayload {
  checkoutUrl: string;
  emailCuenta: string;
  totalPago: number;
  eventoTitulo?: string | null;
}

@Component({
  selector: 'app-pago-wompi',
  imports: [CommonModule, RouterModule],
  templateUrl: './pago-wompi.html',
  styleUrl: './pago-wompi.css',
})
export class PagoWompi implements OnInit {
  payload: WompiCheckoutPayload | null = null;
  redirigiendo = false;
  readonly compraCopy = COMPRA_COPY;

  constructor(
    public router: Router,
    private carritoCompraService: CarritoCompraService,
  ) {}

  ngOnInit(): void {
    this.payload = this.leerPayload();
    if (!this.payload?.checkoutUrl) {
      void this.router.navigate(['/carrito'], {
        queryParams: { aviso: 'pago-wompi-sin-datos' },
      });
    }
  }

  continuarAWompi(): void {
    const url = this.payload?.checkoutUrl;
    if (!url || typeof sessionStorage === 'undefined' || this.redirigiendo) {
      return;
    }
    this.redirigiendo = true;
    sessionStorage.removeItem(WOMPI_CHECKOUT_STORAGE_KEY);
    this.carritoCompraService.vaciarCarrito();
    window.location.href = url;
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(value);
  }

  private leerPayload(): WompiCheckoutPayload | null {
    if (typeof sessionStorage === 'undefined') {
      return null;
    }
    const raw = sessionStorage.getItem(WOMPI_CHECKOUT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<WompiCheckoutPayload>;
      if (typeof parsed.checkoutUrl !== 'string' || !parsed.checkoutUrl.trim()) {
        return null;
      }
      return {
        checkoutUrl: parsed.checkoutUrl.trim(),
        emailCuenta: typeof parsed.emailCuenta === 'string' ? parsed.emailCuenta.trim() : '',
        totalPago: Number(parsed.totalPago) || 0,
        eventoTitulo:
          typeof parsed.eventoTitulo === 'string' ? parsed.eventoTitulo.trim() : null,
      };
    } catch {
      return null;
    }
  }
}
