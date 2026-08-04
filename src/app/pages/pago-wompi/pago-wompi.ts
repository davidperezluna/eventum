import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { CarritoCompraService } from '../../services/carrito-compra.service';
import { ComprasProductoService } from '../../services/compras-producto.service';
import { AlertService } from '../../services/alert.service';
import { AuthService } from '../../services/auth.service';
import { COMPRA_COPY } from '../../core/compra-copy';
import { CompraVinculoAviso } from '../../components/compra-vinculo-aviso/compra-vinculo-aviso';

export const WOMPI_CHECKOUT_STORAGE_KEY = 'eventum_wompi_checkout';
export const PAGO_PENDIENTE_STORAGE_KEY = 'eventum_pago_pendiente';

export interface PagoPendienteCheckoutUi {
  itemsResumen?: PagoWompiResumenLinea[];
  subtotalCompra?: number;
  valorServicio?: number;
  vinculo?: CompraVinculoPayload | null;
  emailCuenta?: string;
  eventoTitulo?: string | null;
  totalPago?: number;
  checkoutUrl?: string | null;
  transaccionCheckoutId?: number | null;
  expiresAtMs?: number | null;
}

export interface CompraVinculoPayload {
  esMixto: boolean;
  tieneBoletas: boolean;
  tieneProductos: boolean;
}

export interface PagoWompiResumenLinea {
  nombre: string;
  detalle?: string | null;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface WompiCheckoutPayload {
  emailCuenta: string;
  totalPago: number;
  eventoTitulo?: string | null;
  itemsResumen?: PagoWompiResumenLinea[];
  subtotalCompra?: number;
  valorServicio?: number;
  vinculo?: CompraVinculoPayload | null;
  /** Recuperación de pago pendiente: URL ya creada en Wompi. */
  checkoutUrl?: string | null;
  /** Compra nueva: cuerpo para crear la transacción al confirmar en esta pantalla. */
  wompiBody?: Record<string, unknown> | null;
  /** Respaldo del pedido cuando ya existe un link pendiente. */
  wompiBodyRespaldo?: Record<string, unknown> | null;
  transaccionCheckoutId?: number | null;
  expiresAtMs?: number | null;
  linkExpiro?: boolean;
}

@Component({
  selector: 'app-pago-wompi',
  imports: [CommonModule, RouterModule, CompraVinculoAviso],
  templateUrl: './pago-wompi.html',
  styleUrl: './pago-wompi.css',
})
export class PagoWompi implements OnInit, OnDestroy {
  payload: WompiCheckoutPayload | null = null;
  redirigiendo = false;
  volviendoCarrito = false;
  nowMs = Date.now();
  expirandoLink = false;
  readonly compraCopy = COMPRA_COPY;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribeAuth?: () => void;
  private readonly onPageShow = (event: PageTransitionEvent): void => {
    if (event.persisted) {
      this.restaurarEstadoTrasRetornoPasarela();
    }
  };

  constructor(
    public router: Router,
    private carritoCompraService: CarritoCompraService,
    private comprasProductoService: ComprasProductoService,
    private alertService: AlertService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.redirigiendo = false;
    this.volviendoCarrito = false;
    if (typeof window !== 'undefined') {
      window.addEventListener('pageshow', this.onPageShow);
    }
    this.payload = this.leerPayload();
    if (!this.esPayloadValido(this.payload)) {
      void this.router.navigate(['/carrito'], {
        queryParams: { aviso: 'pago-wompi-sin-datos' },
      });
      return;
    }
    this.sincronizarEmailCuentaDesdeSesion();
    this.unsubscribeAuth = this.authService.onAuthStateChange((_user, usuario) => {
      if (usuario?.email) {
        this.sincronizarEmailCuentaDesdeSesion();
      }
    });
    void this.hidratarRecuperacionPendiente();
  }

  ngOnDestroy(): void {
    this.stopCountdownTicker();
    if (this.unsubscribeAuth) {
      this.unsubscribeAuth();
      this.unsubscribeAuth = undefined;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('pageshow', this.onPageShow);
    }
  }

  get esRecuperacionLinkActivo(): boolean {
    return !!(
      this.payload?.checkoutUrl?.trim() &&
      !this.payload.linkExpiro &&
      !this.isLinkExpirado()
    );
  }

  get labelBotonContinuar(): string {
    if (this.redirigiendo) {
      return this.compraCopy.pagoWompiAbriendo;
    }
    if (this.esRecuperacionLinkActivo) {
      return this.compraCopy.pagoWompiContinuarRecuperacion;
    }
    if (this.payload?.linkExpiro || this.isLinkExpirado()) {
      return this.compraCopy.pagoWompiGenerarNuevoLink;
    }
    return this.compraCopy.pagoWompiContinuar;
  }

  mostrarCountdownRecuperacion(): boolean {
    return this.esRecuperacionLinkActivo && this.payload?.expiresAtMs != null;
  }

  countdownUrgente(): boolean {
    return this.getRemainingMs() > 0 && this.getRemainingMs() <= 5 * 60 * 1000;
  }

  getCountdownLabel(): string {
    const remainingMs = this.getRemainingMs();
    if (remainingMs <= 0) {
      return '00:00';
    }

    const totalSeconds = Math.floor(remainingMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n: number) => String(n).padStart(2, '0');

    if (hours > 0) {
      return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  }

  async continuarAWompi(): Promise<void> {
    if (!this.payload || typeof sessionStorage === 'undefined' || this.redirigiendo) {
      return;
    }

    if (this.isLinkExpirado() || this.payload.linkExpiro) {
      await this.prepararNuevoLinkTrasExpiracion();
    }

    this.redirigiendo = true;
    try {
      let checkoutUrl = this.esRecuperacionLinkActivo ? this.payload.checkoutUrl?.trim() || '' : '';

      if (!checkoutUrl) {
        const body = await this.resolverWompiBodyParaCheckout();
        if (!body) {
          throw new Error('No hay datos para generar un nuevo link de pago. Vuelve al carrito.');
        }

        const resultado = await this.comprasProductoService.iniciarCheckoutDesdeBody(body);
        if (!resultado.success || !resultado.checkout_url?.trim()) {
          throw new Error(resultado.error || 'No se pudo crear la transacción en Wompi');
        }
        checkoutUrl = resultado.checkout_url.trim();

        let expiresAtMs: number | null = null;
        if (resultado.transaccion_checkout_id) {
          const tx = await this.comprasProductoService.getTransaccionCheckoutById(
            resultado.transaccion_checkout_id,
          );
          expiresAtMs = tx?.expires_at ? new Date(tx.expires_at).getTime() : null;
        }

        const pending: Record<string, unknown> = {};
        if (resultado.transaccion_producto_id) {
          pending['transaccion_producto_id'] = Number(resultado.transaccion_producto_id);
        }
        if (resultado.transaccion_checkout_id) {
          pending['transaccion_checkout_id'] = Number(resultado.transaccion_checkout_id);
        }
        if (this.payload) {
          pending['checkout_ui'] = {
            itemsResumen: this.payload.itemsResumen,
            subtotalCompra: this.payload.subtotalCompra,
            valorServicio: this.payload.valorServicio,
            vinculo: this.payload.vinculo,
            emailCuenta: this.payload.emailCuenta,
            eventoTitulo: this.payload.eventoTitulo,
            totalPago: this.payload.totalPago,
            checkoutUrl,
            transaccionCheckoutId: resultado.transaccion_checkout_id ?? null,
            expiresAtMs,
          } satisfies PagoPendienteCheckoutUi;
        }
        if (Object.keys(pending).length > 0) {
          sessionStorage.setItem(PAGO_PENDIENTE_STORAGE_KEY, JSON.stringify(pending));
        }

        this.persistirPayloadCheckout(checkoutUrl, {
          transaccionCheckoutId: resultado.transaccion_checkout_id ?? null,
          expiresAtMs,
          linkExpiro: false,
        });
      }

      if (!checkoutUrl) {
        throw new Error('No se obtuvo URL de checkout');
      }

      if (!this.carritoCompraService.estaVacio()) {
        this.carritoCompraService.vaciarCarrito();
      }
      window.location.href = checkoutUrl;
    } catch (error: unknown) {
      this.redirigiendo = false;
      const message = error instanceof Error ? error.message : 'Error desconocido';
      if (this.authService.isAuthOrRlsError(message)) {
        await this.authService.ensureActiveSession();
        void this.alertService.error(
          'Sesión expirada',
          'Vuelve a iniciar sesión e intenta finalizar la compra de nuevo.',
        );
        void this.router.navigate(['/login'], { queryParams: { returnUrl: '/carrito', motivo: 'pagar' } });
        return;
      }
      void this.alertService.error('Error al iniciar el pago', message);
      this.cdr.detectChanges();
    }
  }

  volverAlCarrito(): void {
    if (this.volviendoCarrito || this.redirigiendo) {
      return;
    }
    this.volviendoCarrito = true;
    void this.router.navigate(['/carrito']);
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(value);
  }

  private async hidratarRecuperacionPendiente(): Promise<void> {
    if (!this.payload) {
      return;
    }

    if (!this.payload.transaccionCheckoutId) {
      this.payload.transaccionCheckoutId = this.leerTransaccionCheckoutIdPendiente();
    }

    if (
      this.payload.transaccionCheckoutId &&
      (this.payload.checkoutUrl || !this.payload.expiresAtMs)
    ) {
      const tx = await this.comprasProductoService.getTransaccionCheckoutById(
        this.payload.transaccionCheckoutId,
      );
      if (tx?.expires_at) {
        this.payload.expiresAtMs = new Date(tx.expires_at).getTime();
      }
      if (tx?.estado && tx.estado !== 'pendiente') {
        this.payload.linkExpiro = true;
        this.payload.checkoutUrl = null;
      }
    }

    if (
      this.payload.checkoutUrl &&
      !this.payload.wompiBody &&
      !this.payload.wompiBodyRespaldo
    ) {
      await this.restaurarWompiBodyDesdeCheckout();
    }

    if (this.payload.checkoutUrl && this.isLinkExpirado()) {
      await this.marcarLinkExpiro({ cancelarRemoto: true });
    }

    this.guardarPayload();
    this.startCountdownTicker();
    this.sincronizarEmailCuentaDesdeSesion();
    this.cdr.detectChanges();
  }

  private sincronizarEmailCuentaDesdeSesion(): void {
    if (!this.payload) {
      return;
    }

    const email = (
      this.authService.getUsuario()?.email ||
      this.authService.getCurrentUser()?.email ||
      ''
    ).trim();
    if (!email || email === this.payload.emailCuenta) {
      return;
    }

    const clienteId = this.authService.getUsuarioId();
    const teniaLinkPendiente = !!this.payload.checkoutUrl?.trim();

    this.payload = {
      ...this.payload,
      emailCuenta: email,
      wompiBody: this.actualizarCuentaEnBody(this.payload.wompiBody, email, clienteId),
      wompiBodyRespaldo: this.actualizarCuentaEnBody(
        this.payload.wompiBodyRespaldo,
        email,
        clienteId,
      ),
    };

    if (teniaLinkPendiente) {
      this.payload = {
        ...this.payload,
        checkoutUrl: null,
        transaccionCheckoutId: null,
        expiresAtMs: null,
        linkExpiro: false,
        wompiBody: this.payload.wompiBody ?? this.payload.wompiBodyRespaldo,
      };
    }

    this.guardarPayload();
    this.cdr.detectChanges();
  }

  private actualizarCuentaEnBody(
    body: Record<string, unknown> | null | undefined,
    email: string,
    clienteId: number | null,
  ): Record<string, unknown> | null {
    if (!body || typeof body !== 'object') {
      return body ?? null;
    }

    const next: Record<string, unknown> = { ...body, customer_email: email };
    if (clienteId) {
      for (const key of ['pedido_boletas', 'pedido_productos', 'pedido_covers'] as const) {
        const pedido = next[key];
        if (pedido && typeof pedido === 'object') {
          next[key] = { ...(pedido as Record<string, unknown>), cliente_id: clienteId };
        }
      }
    }
    return next;
  }

  private getRemainingMs(): number {
    if (!this.payload?.expiresAtMs) {
      return 0;
    }
    return Math.max(0, this.payload.expiresAtMs - this.nowMs);
  }

  private isLinkExpirado(): boolean {
    if (!this.payload?.expiresAtMs) {
      return false;
    }
    return this.nowMs >= this.payload.expiresAtMs;
  }

  private tickCountdown(): void {
    this.nowMs = Date.now();
    if (
      this.payload?.checkoutUrl &&
      !this.payload.linkExpiro &&
      !this.expirandoLink &&
      this.payload.expiresAtMs != null &&
      this.nowMs >= this.payload.expiresAtMs
    ) {
      void this.marcarLinkExpiro({ cancelarRemoto: true });
      return;
    }
    this.cdr.detectChanges();
  }

  private startCountdownTicker(): void {
    this.stopCountdownTicker();
    this.tickCountdown();
    this.countdownTimer = setInterval(() => this.tickCountdown(), 1000);
  }

  private stopCountdownTicker(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  private async marcarLinkExpiro(options?: { cancelarRemoto?: boolean }): Promise<void> {
    if (!this.payload || this.expirandoLink) {
      return;
    }
    this.expirandoLink = true;
    try {
      const transaccionCheckoutId = this.payload.transaccionCheckoutId;
      if (options?.cancelarRemoto && transaccionCheckoutId) {
        await this.comprasProductoService.cancelarCheckoutPendiente(transaccionCheckoutId);
      }

      if (!this.payload.wompiBodyRespaldo && !this.payload.wompiBody && transaccionCheckoutId) {
        await this.restaurarWompiBodyDesdeCheckout();
      }

      this.payload = {
        ...this.payload,
        checkoutUrl: null,
        transaccionCheckoutId: null,
        expiresAtMs: null,
        linkExpiro: true,
        wompiBody: this.payload.wompiBodyRespaldo ?? this.payload.wompiBody ?? null,
      };
      this.guardarPayload();
    } finally {
      this.expirandoLink = false;
      this.cdr.detectChanges();
    }
  }

  private async prepararNuevoLinkTrasExpiracion(): Promise<void> {
    if (!this.payload?.linkExpiro && !this.isLinkExpirado()) {
      return;
    }
    await this.marcarLinkExpiro({ cancelarRemoto: true });
  }

  private async resolverWompiBodyParaCheckout(): Promise<Record<string, unknown> | null> {
    if (!this.payload) {
      return null;
    }
    if (this.payload.wompiBody && Object.keys(this.payload.wompiBody).length > 0) {
      return this.payload.wompiBody;
    }
    if (this.payload.wompiBodyRespaldo && Object.keys(this.payload.wompiBodyRespaldo).length > 0) {
      return this.payload.wompiBodyRespaldo;
    }
    await this.restaurarWompiBodyDesdeCheckout();
    return this.payload.wompiBodyRespaldo ?? this.payload.wompiBody ?? null;
  }

  private async restaurarWompiBodyDesdeCheckout(): Promise<void> {
    if (!this.payload?.transaccionCheckoutId) {
      return;
    }
    const body = await this.comprasProductoService.getWompiBodyRespaldoFromCheckout(
      this.payload.transaccionCheckoutId,
    );
    if (!body) {
      return;
    }
    this.payload = {
      ...this.payload,
      wompiBodyRespaldo: body,
    };
  }

  private leerTransaccionCheckoutIdPendiente(): number | null {
    if (typeof sessionStorage === 'undefined') {
      return null;
    }
    const raw = sessionStorage.getItem(PAGO_PENDIENTE_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as { transaccion_checkout_id?: number };
      const id = Number(parsed.transaccion_checkout_id);
      return Number.isFinite(id) && id > 0 ? id : null;
    } catch {
      return null;
    }
  }

  private restaurarEstadoTrasRetornoPasarela(): void {
    this.redirigiendo = false;
    this.volviendoCarrito = false;
    if (this.payload?.checkoutUrl?.trim()) {
      this.persistirPayloadCheckout(this.payload.checkoutUrl.trim());
    }
    this.cdr.detectChanges();
  }

  private persistirPayloadCheckout(
    checkoutUrl: string | null,
    meta?: {
      transaccionCheckoutId?: number | null;
      expiresAtMs?: number | null;
      linkExpiro?: boolean;
    },
  ): void {
    if (!this.payload || typeof sessionStorage === 'undefined') {
      return;
    }
    const respaldo =
      this.payload.wompiBodyRespaldo ??
      (this.payload.wompiBody && Object.keys(this.payload.wompiBody).length > 0
        ? this.payload.wompiBody
        : null);

    this.payload = {
      ...this.payload,
      checkoutUrl: checkoutUrl?.trim() || this.payload.checkoutUrl || null,
      wompiBody: null,
      wompiBodyRespaldo: respaldo,
      transaccionCheckoutId:
        meta?.transaccionCheckoutId !== undefined
          ? meta.transaccionCheckoutId
          : this.payload.transaccionCheckoutId,
      expiresAtMs:
        meta?.expiresAtMs !== undefined ? meta.expiresAtMs : this.payload.expiresAtMs,
      linkExpiro: meta?.linkExpiro ?? this.payload.linkExpiro ?? false,
    };
    this.guardarPayload();
  }

  private guardarPayload(): void {
    if (!this.payload || typeof sessionStorage === 'undefined') {
      return;
    }
    sessionStorage.setItem(WOMPI_CHECKOUT_STORAGE_KEY, JSON.stringify(this.payload));
    this.sincronizarCheckoutUiPendiente(this.payload);
  }

  private sincronizarCheckoutUiPendiente(payload: WompiCheckoutPayload): void {
    if (typeof sessionStorage === 'undefined') {
      return;
    }
    const raw = sessionStorage.getItem(PAGO_PENDIENTE_STORAGE_KEY);
    let pending: Record<string, unknown> = {};
    if (raw) {
      try {
        pending = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        pending = {};
      }
    }
    pending['checkout_ui'] = {
      itemsResumen: payload.itemsResumen,
      subtotalCompra: payload.subtotalCompra,
      valorServicio: payload.valorServicio,
      vinculo: payload.vinculo,
      emailCuenta: payload.emailCuenta,
      eventoTitulo: payload.eventoTitulo,
      totalPago: payload.totalPago,
      checkoutUrl: payload.checkoutUrl,
      transaccionCheckoutId: payload.transaccionCheckoutId,
      expiresAtMs: payload.expiresAtMs,
    } satisfies PagoPendienteCheckoutUi;
    if (payload.transaccionCheckoutId) {
      pending['transaccion_checkout_id'] = payload.transaccionCheckoutId;
    }
    sessionStorage.setItem(PAGO_PENDIENTE_STORAGE_KEY, JSON.stringify(pending));
  }

  private esPayloadValido(payload: WompiCheckoutPayload | null): payload is WompiCheckoutPayload {
    if (!payload) {
      return false;
    }
    const tieneUrl = typeof payload.checkoutUrl === 'string' && !!payload.checkoutUrl.trim();
    const tieneBody =
      payload.wompiBody != null &&
      typeof payload.wompiBody === 'object' &&
      Object.keys(payload.wompiBody).length > 0;
    const tieneRespaldo =
      payload.wompiBodyRespaldo != null &&
      typeof payload.wompiBodyRespaldo === 'object' &&
      Object.keys(payload.wompiBodyRespaldo).length > 0;
    return tieneUrl || tieneBody || tieneRespaldo;
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
      const checkoutUrl =
        typeof parsed.checkoutUrl === 'string' && parsed.checkoutUrl.trim()
          ? parsed.checkoutUrl.trim()
          : null;
      const wompiBody =
        parsed.wompiBody != null && typeof parsed.wompiBody === 'object'
          ? (parsed.wompiBody as Record<string, unknown>)
          : null;
      const wompiBodyRespaldo =
        parsed.wompiBodyRespaldo != null && typeof parsed.wompiBodyRespaldo === 'object'
          ? (parsed.wompiBodyRespaldo as Record<string, unknown>)
          : null;

      return {
        checkoutUrl,
        wompiBody,
        wompiBodyRespaldo,
        vinculo: this.parseVinculoPayload(parsed.vinculo),
        itemsResumen: this.parseItemsResumen(parsed.itemsResumen),
        subtotalCompra:
          parsed.subtotalCompra != null && !Number.isNaN(Number(parsed.subtotalCompra))
            ? Number(parsed.subtotalCompra)
            : undefined,
        valorServicio:
          parsed.valorServicio != null && !Number.isNaN(Number(parsed.valorServicio))
            ? Number(parsed.valorServicio)
            : undefined,
        emailCuenta: typeof parsed.emailCuenta === 'string' ? parsed.emailCuenta.trim() : '',
        totalPago: Number(parsed.totalPago) || 0,
        eventoTitulo:
          typeof parsed.eventoTitulo === 'string' ? parsed.eventoTitulo.trim() : null,
        transaccionCheckoutId:
          parsed.transaccionCheckoutId != null && !Number.isNaN(Number(parsed.transaccionCheckoutId))
            ? Number(parsed.transaccionCheckoutId)
            : null,
        expiresAtMs:
          parsed.expiresAtMs != null && !Number.isNaN(Number(parsed.expiresAtMs))
            ? Number(parsed.expiresAtMs)
            : null,
        linkExpiro: !!parsed.linkExpiro,
      };
    } catch {
      return null;
    }
  }

  private parseItemsResumen(raw: unknown): PagoWompiResumenLinea[] {
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw
      .map((entry): PagoWompiResumenLinea | null => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }
        const item = entry as Partial<PagoWompiResumenLinea>;
        const nombre = typeof item.nombre === 'string' ? item.nombre.trim() : '';
        const cantidad = Number(item.cantidad);
        const precioUnitario = Number(item.precioUnitario);
        const subtotal = Number(item.subtotal);
        if (!nombre || !Number.isFinite(cantidad) || cantidad <= 0) {
          return null;
        }
        return {
          nombre,
          detalle:
            typeof item.detalle === 'string' && item.detalle.trim() ? item.detalle.trim() : null,
          cantidad,
          precioUnitario: Number.isFinite(precioUnitario) ? precioUnitario : 0,
          subtotal: Number.isFinite(subtotal) ? subtotal : precioUnitario * cantidad,
        };
      })
      .filter((linea): linea is PagoWompiResumenLinea => linea != null);
  }

  private parseVinculoPayload(raw: unknown): CompraVinculoPayload | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const v = raw as Partial<CompraVinculoPayload>;
    return {
      esMixto: !!v.esMixto,
      tieneBoletas: !!v.tieneBoletas,
      tieneProductos: !!v.tieneProductos,
    };
  }
}
