import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ComprasClienteService } from '../../services/compras-cliente.service';
import { ComprasProductoService } from '../../services/compras-producto.service';
import { Compra, CompraProducto, TransaccionProducto } from '../../types';
import { DateFormatPipe } from '../../pipes/date-format.pipe';

const PAGO_PENDIENTE_STORAGE_KEY = 'eventum_pago_pendiente';

@Component({
  selector: 'app-pago-resultado',
  imports: [CommonModule, RouterModule, DateFormatPipe],
  templateUrl: './pago-resultado.html',
  styleUrl: './pago-resultado.css',
})
export class PagoResultado implements OnInit {
  compraId: number | null = null;
  compraProductoId: number | null = null;
  transaccionProductoId: number | null = null;
  transaccionCheckoutId: number | null = null;
  wompiTxnId: string | null = null;
  compra: Compra | null = null;
  compraProducto: CompraProducto | null = null;
  transaccionProducto: TransaccionProducto | null = null;
  loading = true;
  error: string | null = null;
  errorTitulo = 'No pudimos mostrar tu compra';

  constructor(
    private route: ActivatedRoute,
    public router: Router,
    private comprasClienteService: ComprasClienteService,
    private comprasProductoService: ComprasProductoService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.route.queryParams.subscribe((params) => {
      this.compraId = params['compra_id'] ? Number(params['compra_id']) : null;
      this.compraProductoId = params['compra_producto_id'] ? Number(params['compra_producto_id']) : null;
      this.transaccionProductoId = params['transaccion_producto_id']
        ? Number(params['transaccion_producto_id'])
        : null;
      this.transaccionCheckoutId = params['transaccion_checkout_id']
        ? Number(params['transaccion_checkout_id'])
        : null;
      this.wompiTxnId = params['id'] ? String(params['id']) : null;

      const reference = params['reference'] ? String(params['reference']) : null;
      if (!this.transaccionProductoId && reference) {
        // Solo referencias de productos/mixto contienen el TXN de transaccion_producto.
        // En checkout unificado boletas usamos EVENTUM-CHK-TXN-<checkoutId>, que NO debe mapearse aquí.
        const prodTxnMatch = reference.match(/^EVENTUM-PROD-TXN-(\d+)-/i);
        const mixTxnMatch = reference.match(/^EVENTUM-MIX-\d+-TXN-(\d+)-/i);
        const txnMatch = prodTxnMatch ?? mixTxnMatch;
        if (txnMatch?.[1]) {
          this.transaccionProductoId = Number(txnMatch[1]);
        }
      }

      this.restaurarReferenciasPendientes();

      if (this.compraId || this.compraProductoId || this.transaccionProductoId || this.transaccionCheckoutId || this.wompiTxnId) {
        void this.verificarEstadoCompra();
      } else {
        this.mostrarErrorSinReferencia();
      }
    });
  }

  private restaurarReferenciasPendientes(): void {
    if (typeof sessionStorage === 'undefined') {
      return;
    }

    try {
      const raw = sessionStorage.getItem(PAGO_PENDIENTE_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const pending = JSON.parse(raw) as {
        compra_id?: number;
        compra_producto_id?: number;
        transaccion_producto_id?: number;
        transaccion_checkout_id?: number;
      };

      if (!this.compraId && pending.compra_id) {
        this.compraId = Number(pending.compra_id);
      }
      if (!this.compraProductoId && pending.compra_producto_id) {
        this.compraProductoId = Number(pending.compra_producto_id);
      }
      if (!this.transaccionProductoId && pending.transaccion_producto_id) {
        this.transaccionProductoId = Number(pending.transaccion_producto_id);
      }
      if (!this.transaccionCheckoutId && pending.transaccion_checkout_id) {
        this.transaccionCheckoutId = Number(pending.transaccion_checkout_id);
      }
    } catch {
      // Ignorar JSON inválido
    }
  }

  private limpiarReferenciasPendientes(): void {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(PAGO_PENDIENTE_STORAGE_KEY);
    }
  }

  private mostrarErrorSinReferencia(): void {
    this.errorTitulo = 'Falta información del pago';
    this.error =
      'Este enlace no incluye la referencia de la compra. Vuelve desde el evento o revisa Mis compras; si pagaste por Wompi, el comprobante puede tardar unos minutos en reflejarse.';
    this.loading = false;
  }

  private async resolverReferencias(): Promise<boolean> {
    if (this.compraId || this.compraProductoId || this.transaccionProductoId) {
      return true;
    }

    if (this.transaccionCheckoutId) {
      const fromCheckout = await this.comprasProductoService.resolverPorCheckoutId(this.transaccionCheckoutId);
      if (!this.compraId && fromCheckout.compraId) this.compraId = fromCheckout.compraId;
      if (!this.compraProductoId && fromCheckout.compraProductoId) this.compraProductoId = fromCheckout.compraProductoId;
      if (!this.transaccionProductoId && fromCheckout.transaccionProductoId) {
        this.transaccionProductoId = fromCheckout.transaccionProductoId;
      }
      if (this.compraId || this.compraProductoId || this.transaccionProductoId) {
        return true;
      }
    }

    if (!this.wompiTxnId) {
      return false;
    }

    const resuelto = await this.comprasProductoService.resolverPorWompiRedirect(this.wompiTxnId);
    if (resuelto.compraId) this.compraId = resuelto.compraId;
    if (resuelto.compraProductoId) this.compraProductoId = resuelto.compraProductoId;
    if (resuelto.transaccionProductoId) this.transaccionProductoId = resuelto.transaccionProductoId;

    return !!(this.compraId || this.compraProductoId || this.transaccionProductoId);
  }

  async verificarEstadoCompra(): Promise<void> {
    const intentosMax = this.wompiTxnId && !this.transaccionProductoId ? 12 : this.wompiTxnId ? 10 : 1;
    const delayMs = 2500;

    for (let intento = 0; intento < intentosMax; intento++) {
      if (intento > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      try {
        const tieneReferencia = await this.resolverReferencias();
        if (!tieneReferencia) {
          if (this.transaccionCheckoutId && this.wompiTxnId) {
            await this.comprasProductoService.sincronizarEstadoWompi({
              wompi_transaction_id: this.wompiTxnId,
              transaccion_checkout_id: this.transaccionCheckoutId,
            });
          }
          if (intento < intentosMax - 1) {
            continue;
          }
          this.mostrarErrorSinReferencia();
          this.cdr.detectChanges();
          return;
        }

        if (this.compraId) {
          this.compra = await this.comprasClienteService.getCompraById(this.compraId);
        }

        if (this.transaccionProductoId) {
          this.transaccionProducto = await this.comprasProductoService.getTransaccionById(
            this.transaccionProductoId
          );
          if (this.transaccionProducto.compra_producto_id) {
            this.compraProductoId = this.transaccionProducto.compra_producto_id;
          }

          const wompiTxnParaSync =
            this.wompiTxnId || this.transaccionProducto.wompi_transaction_id || null;
          if (
            wompiTxnParaSync &&
            (this.transaccionProducto.estado === 'pendiente' ||
              this.transaccionProducto.wompi_status === 'PENDING')
          ) {
            await this.comprasProductoService.sincronizarEstadoWompi({
              wompi_transaction_id: wompiTxnParaSync,
              transaccion_checkout_id: this.transaccionCheckoutId ?? undefined,
              transaccion_producto_id: this.transaccionProductoId,
              compra_id: this.compraId ?? undefined,
            });
            this.transaccionProducto = await this.comprasProductoService.getTransaccionById(
              this.transaccionProductoId
            );
            if (this.transaccionProducto.compra_producto_id) {
              this.compraProductoId = this.transaccionProducto.compra_producto_id;
            }
          }

          const creadaMs = this.transaccionProducto.fecha_creacion
            ? new Date(this.transaccionProducto.fecha_creacion).getTime()
            : Number.NaN;
          const pasaronDiezMinutos = Number.isFinite(creadaMs) && Date.now() - creadaMs >= 10 * 60 * 1000;
          const siguePendiente =
            this.transaccionProducto.estado === 'pendiente' ||
            !this.transaccionProducto.wompi_status ||
            this.transaccionProducto.wompi_status === 'PENDING';
          const noHayWompiTxn =
            !(this.wompiTxnId || this.transaccionProducto.wompi_transaction_id);

          if (siguePendiente && noHayWompiTxn && pasaronDiezMinutos) {
            this.errorTitulo = 'El pago no se completó';
            this.error =
              'Tu transacción de productos no quedó confirmada y el intento de pago expiró. Puedes volver al evento para intentarlo de nuevo.';
            this.loading = false;
            this.cdr.detectChanges();
            return;
          }
        }

        if (this.compraId && this.wompiTxnId && !this.transaccionProductoId) {
          const compraPendiente =
            !this.compra ||
            this.compra.estado_pago === 'pendiente' ||
            this.compra.wompi_status === 'PENDING';
          if (compraPendiente) {
            await this.comprasProductoService.sincronizarEstadoWompi({
              wompi_transaction_id: this.wompiTxnId,
              transaccion_checkout_id: this.transaccionCheckoutId ?? undefined,
              compra_id: this.compraId,
            });
            this.compra = await this.comprasClienteService.getCompraById(this.compraId);
          }
        }

        if (this.compraProductoId) {
          this.compraProducto = await this.comprasProductoService.getCompraById(this.compraProductoId);
        }

        this.loading = false;
        this.error = null;
        this.limpiarReferenciasPendientes();
        this.cdr.detectChanges();
        return;
      } catch (err: unknown) {
        const errorObj = err as { code?: string; error?: { code?: string } };
        const code = errorObj?.code ?? errorObj?.error?.code;

        if (this.transaccionProducto && !this.compraProducto) {
          if (
            this.transaccionProducto.estado === 'rechazada' ||
            this.transaccionProducto.estado === 'cancelada' ||
            this.transaccionProducto.wompi_status === 'EXPIRED'
          ) {
            this.errorTitulo = 'El pago no se completó';
            this.error =
              'Tu transacción de productos no quedó confirmada. No se registró ningún pedido de productos.';
          } else if (intento < intentosMax - 1) {
            continue;
          } else {
            this.loading = false;
            this.error = null;
            this.cdr.detectChanges();
            return;
          }
        } else if (code === 'PGRST116' && intento < intentosMax - 1) {
          continue;
        } else if (code === 'PGRST116') {
          this.errorTitulo = 'El pago no se completó';
          this.error =
            'Tu transacción no quedó confirmada en el sistema (o fue rechazada). Si ves un cobro en tu cuenta, revisa Mis compras o contacta a tu banco.';
        } else if (intento < intentosMax - 1) {
          continue;
        } else {
          this.errorTitulo = 'No pudimos verificar tu compra';
          this.error =
            'Hubo un fallo temporal al obtener los datos. Revisa Mis compras en unos minutos o intenta refrescar esta página.';
        }

        this.loading = false;
        this.cdr.detectChanges();
        return;
      }
    }
  }

  getEstadoPagoReferencia(): 'completado' | 'pendiente' | 'fallido' | 'otro' {
    const estadosTransaccion = this.transaccionProducto?.estado;
    const estadoTransaccionProducto =
      estadosTransaccion === 'aprobada'
        ? 'completado'
        : estadosTransaccion === 'rechazada' || estadosTransaccion === 'cancelada'
          ? 'fallido'
          : estadosTransaccion === 'pendiente'
            ? 'pendiente'
            : null;

    const estados = [
      this.compra?.estado_pago,
      this.compraProducto?.estado_pago,
      estadoTransaccionProducto
    ].filter(Boolean) as string[];

    if (estados.some((e) => e === 'fallido')) return 'fallido';
    if (estados.length > 0 && estados.every((e) => e === 'completado')) return 'completado';
    if (estados.some((e) => e === 'pendiente')) return 'pendiente';
    return 'otro';
  }

  getEstadoPagoLabel(): string {
    switch (this.getEstadoPagoReferencia()) {
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

  getEstadoPagoEyebrow(): string {
    switch (this.getEstadoPagoReferencia()) {
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

  getEstadoPagoLead(): string {
    switch (this.getEstadoPagoReferencia()) {
      case 'completado':
        return 'Tu compra quedó registrada. Revisa Mis compras para boletas; los productos se entregan en el evento.';
      case 'pendiente':
        return 'Tu banco o Wompi aún pueden estar procesando el cobro. En unos minutos debería actualizarse aquí y en Mis compras.';
      case 'fallido':
        return 'No se aplicó ningún cobro válido desde esta solicitud. Puedes volver al evento e intentarlo con otro medio de pago.';
      default:
        return 'Revisa Mis compras o contacta soporte si el problema continúa.';
    }
  }

  getTotalMostrado(): number {
    const totalProductos = this.compraProducto?.total ?? this.transaccionProducto?.monto ?? 0;
    return (this.compra?.total ?? 0) + totalProductos;
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
