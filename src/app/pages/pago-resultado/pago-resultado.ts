import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ComprasClienteService } from '../../services/compras-cliente.service';
import { Compra } from '../../types';
import { DateFormatPipe } from '../../pipes/date-format.pipe';

@Component({
  selector: 'app-pago-resultado',
  imports: [CommonModule, RouterModule, DateFormatPipe],
  templateUrl: './pago-resultado.html',
  styleUrl: './pago-resultado.css',
})
export class PagoResultado implements OnInit {
  compraId: number | null = null;
  compra: Compra | null = null;
  loading = true;
  error: string | null = null;
  /** Titular corto cuando hay error técnico o de negocio */
  errorTitulo = 'No pudimos mostrar tu compra';

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
        this.errorTitulo = 'Falta información del pago';
        this.error =
          'Este enlace no incluye la referencia de la compra. Vuelve desde el evento o revisa Mis compras; si pagaste por Wompi, el comprobante puede tardar unos minutos en reflejarse.';
        this.loading = false;
      }
    });
  }

  async verificarEstadoCompra() {
    if (!this.compraId) return;

    // Esperar un momento para que el webhook procese
    setTimeout(async () => {
      try {
        const compra = await this.comprasClienteService.getCompraById(this.compraId!);
        this.compra = compra;
        this.loading = false;
        this.cdr.detectChanges();
      } catch (err: any) {
        console.error('Error cargando compra:', err);
        const code = err?.code ?? err?.error?.code;
        // Tras pago fallido el webhook puede purgar la compra (sin filas → PGRST116).
        if (code === 'PGRST116') {
          this.errorTitulo = 'El pago no se completó';
          this.error =
            'Tu transacción no quedó confirmada en el sistema (o fue rechazada). No hay compra registrada con este enlace y los cupos reservados se liberaron. Si ves un cobro en tu cuenta, revisa Mis compras o contacta a tu banco; el reembolso depende del medio de pago.';
        } else {
          this.errorTitulo = 'No pudimos verificar tu compra';
          this.error =
            'Hubo un fallo temporal al obtener los datos. Revisa Mis compras en unos minutos o intenta refrescar esta página.';
        }
        this.loading = false;
        this.cdr.detectChanges();
      }
    }, 2000); // Esperar 2 segundos para que el webhook procese
  }

  getEstadoPagoLabel(): string {
    if (!this.compra) return '';
    switch (this.compra.estado_pago) {
      case 'completado':
        return 'Pago confirmado';
      case 'pendiente':
        return 'Esperando confirmación';
      case 'fallido':
        return 'Pago no realizado';
      default:
        return 'Estado en revisión';
    }
  }

  /** Etiqueta pequeña encima del título (jerarquía visual) */
  getEstadoPagoEyebrow(): string {
    if (!this.compra) return '';
    switch (this.compra.estado_pago) {
      case 'completado':
        return 'Estado · Compra registrada';
      case 'pendiente':
        return 'Estado · En validación';
      case 'fallido':
        return 'Estado · Sin cobro aplicado';
      default:
        return 'Estado';
    }
  }

  /** Una línea visible bajo el título principal */
  getEstadoPagoLead(): string {
    if (!this.compra) return '';
    switch (this.compra.estado_pago) {
      case 'completado':
        return 'Tu compra quedó registrada. Tus boletas están en Mis compras; el QR puede habilitarse más cerca del evento.';
      case 'pendiente':
        return 'Tu banco o Wompi aún pueden estar procesando el cobro. En unos minutos debería actualizarse aquí y en Mis compras. Si cerraste antes de terminar, vuelve a intentar desde el evento.';
      case 'fallido':
        return 'No se aplicó ningún cobro válido desde esta solicitud. Puedes volver al evento e intentarlo con otro medio de pago.';
      default:
        return 'Revisa Mis compras o contacta soporte si el problema continúa.';
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

