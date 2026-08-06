import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DateFormatPipe } from '../../pipes/date-format.pipe';
import { AlertService } from '../../services/alert.service';
import {
  WompiDiagnosticoItem,
  WompiReconcileCheckout,
  WompiReconcileLookupResult,
  WompiReconcileOrphanRow,
  WompiReconcileService,
  WompiGuiaSoporte,
  WompiTitularItem,
} from '../../services/wompi-reconcile.service';

type TabId = 'buscar' | 'huerfanos';

@Component({
  selector: 'app-wompi-reconcile',
  imports: [CommonModule, FormsModule, DateFormatPipe, RouterLink],
  templateUrl: './wompi-reconcile.html',
  styleUrl: './wompi-reconcile.css',
})
export class WompiReconcile implements OnInit {
  private readonly diagnosticoOcultoEnGuia = new Set([
    'ALIGNED',
    'NO_ISSUES_DETECTED',
    'EMAIL_WOMPI_VS_CUENTA',
    'TRASLADO_PENDIENTE',
    'TITULAR_DISTINTO_COMPRADOR',
  ]);

  activeTab: TabId = 'buscar';

  searchReference = '';
  searchWompiTxId = '';
  searchEmail = '';
  searchCheckoutId = '';

  loading = false;
  syncingId: number | null = null;
  result: WompiReconcileLookupResult | null = null;
  searchError: string | null = null;

  orphansLoading = false;
  orphans: WompiReconcileOrphanRow[] = [];

  constructor(
    private wompiReconcileService: WompiReconcileService,
    private alertService: AlertService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.loadOrphans();
  }

  setTab(tab: TabId): void {
    this.activeTab = tab;
    if (tab === 'huerfanos' && this.orphans.length === 0) {
      void this.loadOrphans();
    }
  }

  async buscar(): Promise<void> {
    const reference = this.searchReference.trim();
    const wompiTx = this.searchWompiTxId.trim();
    const email = this.searchEmail.trim();
    const checkoutId = this.parsePositiveInt(this.searchCheckoutId);

    if (!reference && !wompiTx && !email && !checkoutId) {
      this.alertService.warning(
        'Búsqueda',
        'Indica referencia, transacción #, correo del cliente o Checkout ID.',
      );
      return;
    }

    this.loading = true;
    this.result = null;
    this.searchError = null;
    this.cdr.detectChanges();

    try {
      this.result = await this.wompiReconcileService.lookup({
        reference: reference || undefined,
        wompi_transaction_id: wompiTx || undefined,
        email: email || undefined,
        transaccion_checkout_id: checkoutId ?? undefined,
      });
      if (!this.result.success) {
        this.searchError = this.result.error || 'No se pudo consultar.';
        this.alertService.error('Consulta fallida', this.searchError);
      } else {
        this.searchError = null;
        void this.loadOrphans();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error inesperado';
      this.searchError = message;
      this.alertService.error('Error', message);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async loadOrphans(): Promise<void> {
    this.orphansLoading = true;
    this.cdr.detectChanges();
    try {
      const response = await this.wompiReconcileService.listOrphans();
      if (!response.success) {
        this.alertService.error('Error', response.error || 'No se pudieron cargar huérfanos.');
        this.orphans = [];
        return;
      }
      this.orphans = response.orphans;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error inesperado';
      this.alertService.error('Error', message);
      this.orphans = [];
    } finally {
      this.orphansLoading = false;
      this.cdr.detectChanges();
    }
  }

  async sincronizar(checkoutId: number): Promise<void> {
    this.syncingId = checkoutId;
    this.cdr.detectChanges();
    try {
      const response = await this.wompiReconcileService.sincronizar(checkoutId);
      if (!response.success) {
        this.alertService.error('Sync fallido', response.error || 'No se pudo sincronizar.');
        return;
      }
      if (response.already_synced) {
        this.alertService.success('Sync', 'El checkout ya estaba sincronizado.');
      } else {
        this.alertService.success('Sync', 'Materialización completada.');
      }
      if (this.activeTab === 'huerfanos') {
        await this.loadOrphans();
      }
      if (this.result?.checkout?.id === checkoutId) {
        await this.buscarCheckoutId(checkoutId);
      }
    } finally {
      this.syncingId = null;
      this.cdr.detectChanges();
    }
  }

  verEnBuscar(row: WompiReconcileOrphanRow): void {
    this.activeTab = 'buscar';
    this.searchCheckoutId = String(row.id);
    this.searchReference = '';
    this.searchWompiTxId = '';
    this.searchEmail = '';
    void this.buscar();
  }

  analizarCheckoutDesdeEmail(checkoutId: number): void {
    this.searchCheckoutId = String(checkoutId);
    this.searchReference = '';
    this.searchWompiTxId = '';
    void this.buscar();
  }

  getEmailMatchTypeLabel(matchType: string): string {
    if (matchType === 'comprobante_wompi') return 'Recibo Wompi';
    if (matchType === 'cuenta_eventum') return 'Comprador';
    return matchType;
  }

  resolveCheckoutTipo(checkout: WompiReconcileCheckout | null | undefined): string {
    if (!checkout) return '';

    const fromRow = String(checkout.tipo ?? '').trim().toLowerCase();
    if (fromRow) return fromRow;

    const fromMeta = checkout.metadata?.['tipo'];
    if (fromMeta != null && String(fromMeta).trim()) {
      return String(fromMeta).trim().toLowerCase();
    }

    const payload = checkout.request_payload || {};
    const requestBody = (payload['request_body'] || payload) as Record<string, unknown>;
    const fromBody = String(requestBody['tipo'] ?? '').trim().toLowerCase();
    if (fromBody) return fromBody;

    const hasItems = (key: string): boolean => {
      const block = requestBody[key] as Record<string, unknown> | undefined;
      const items = block?.['items'];
      return Array.isArray(items) && items.length > 0;
    };

    const hasCovers = hasItems('pedido_covers');
    const hasProductos = hasItems('pedido_productos');
    const hasBoletas = hasItems('pedido_boletas');

    if (hasCovers) return hasProductos ? 'cover_mixto' : 'cover';
    if (hasBoletas) return hasProductos ? 'mixto' : 'boletas';
    if (hasProductos) return 'productos';

    const hasCompraBoletas = this.parsePositiveInt(checkout.compra_id) != null;
    const hasCompraProductos = this.parsePositiveInt(checkout.compra_producto_id) != null;
    const hasCompraCover = this.parsePositiveInt(checkout.compra_cover_id) != null;

    if (hasCompraCover && hasCompraProductos) return 'cover_mixto';
    if (hasCompraCover) return 'cover';
    if (hasCompraBoletas && hasCompraProductos) return 'mixto';
    if (hasCompraProductos) return 'productos';
    if (hasCompraBoletas) return 'boletas';

    return '';
  }

  getCheckoutTipoLabel(checkout: WompiReconcileCheckout | null | undefined): string {
    const tipo = this.resolveCheckoutTipo(checkout);
    const labels: Record<string, string> = {
      boletas: 'Boletas',
      productos: 'Productos',
      mixto: 'Mixta',
      cover: 'Cover',
      cover_mixto: 'Cover + productos',
    };
    return labels[tipo] ?? (tipo || '—');
  }

  getCheckoutTipoBadgeClass(checkout: WompiReconcileCheckout | null | undefined): string {
    const tipo = this.resolveCheckoutTipo(checkout);
    if (tipo === 'mixto' || tipo === 'cover_mixto') return 'wr-badge wr-badge--warn';
    if (tipo === 'productos') return 'wr-badge wr-badge--info';
    if (tipo === 'cover') return 'wr-badge wr-badge--neutral';
    if (tipo === 'boletas') return 'wr-badge wr-badge--ok';
    return 'wr-badge wr-badge--neutral';
  }

  getGuiaSoporte(result: WompiReconcileLookupResult | null): WompiGuiaSoporte | null {
    if (!result) return null;

    const diag = result.diagnostico ?? [];
    const critico = diag.find((d) =>
      ['CHECKOUT_NOT_FOUND', 'NEEDS_MATERIALIZATION', 'WOMPI_APPROVED_CHECKOUT_PENDING', 'PRODUCTO_NEEDS_MATERIALIZATION'].includes(
        d.codigo,
      ),
    );
    if (critico) {
      return { title: 'Acción requerida', text: critico.mensaje, warn: true };
    }

    if (result.titular_context?.hay_traslados_pendientes) {
      return {
        title: 'Traslado pendiente',
        text: result.titular_context.mensaje_soporte ?? 'El destinatario debe aceptar en su cuenta.',
        warn: true,
      };
    }

    if (this.emailsDifferen(result) && result.email_context?.email_cuenta_eventum) {
      return {
        title: 'Correos distintos',
        text:
          result.email_context.mensaje_soporte ??
          `Entrar con ${result.email_context.email_cuenta_eventum} (Mis compras), no con el email del recibo Wompi.`,
        warn: true,
        showEmailCompare: true,
      };
    }

    if (result.titular_context?.hay_titular_distinto_comprador) {
      return {
        title: 'Titular distinto',
        text: result.titular_context.mensaje_soporte ?? 'La entrada está en otra cuenta (ver tabla abajo).',
        warn: false,
      };
    }

    const wompiNotFound = diag.find((d) => d.codigo === 'WOMPI_NOT_FOUND');
    if (wompiNotFound && result.checkout) {
      return { title: 'Wompi sin respuesta', text: wompiNotFound.mensaje, warn: false };
    }

    return null;
  }

  getDiagnosticoVisible(result: WompiReconcileLookupResult | null): WompiDiagnosticoItem[] {
    const guia = this.getGuiaSoporte(result);
    return (result?.diagnostico ?? []).filter((d) => {
      if (this.diagnosticoOcultoEnGuia.has(d.codigo)) return false;
      if (guia && d.codigo === guia.title) return false;
      if (guia?.text === d.mensaje) return false;
      return true;
    });
  }

  emailsDifferen(result: WompiReconcileLookupResult | null): boolean {
    return result?.email_context?.emails_coinciden === false;
  }

  hasTitularContext(result: WompiReconcileLookupResult | null): boolean {
    return (result?.titular_context?.items?.length ?? 0) > 0;
  }

  getTitularItems(result: WompiReconcileLookupResult | null): WompiTitularItem[] {
    return result?.titular_context?.items ?? [];
  }

  getTitularTipoLabel(tipo: string): string {
    return tipo === 'cover' ? 'Cover' : 'Boleta';
  }

  getTrasladoBadgeClass(item: WompiTitularItem): string {
    if (!item.traslado_pendiente) {
      return item.es_comprador ? 'wr-badge wr-badge--ok' : 'wr-badge wr-badge--neutral';
    }
    return item.traslado_estado === 'recibido'
      ? 'wr-badge wr-badge--warn'
      : 'wr-badge wr-badge--warn';
  }

  getTrasladoLabel(item: WompiTitularItem): string {
    if (item.traslado_pendiente && item.traslado_destino_email) {
      return `Pendiente → ${item.traslado_destino_email}`;
    }
    if (item.es_comprador) return 'Comprador';
    if (item.titular_email) return 'Otro titular';
    return '—';
  }

  private async buscarCheckoutId(id: number): Promise<void> {
    this.searchCheckoutId = String(id);
    this.loading = true;
    this.cdr.detectChanges();
    try {
      this.result = await this.wompiReconcileService.lookup({ transaccion_checkout_id: id });
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  getOrphanTipoLabel(row: WompiReconcileOrphanRow): string {
    if (row.orphan_tipo === 'pendiente_vencida') {
      return 'Pendiente vencida';
    }
    if (row.orphan_tipo === 'aprobada_sin_compra') {
      return 'Aprobada sin compra';
    }
    return row.estado === 'pendiente' ? 'Pendiente' : 'Sin compra';
  }

  orphanTipoClass(row: WompiReconcileOrphanRow): string {
    return row.estado === 'pendiente' || row.orphan_tipo === 'pendiente_vencida'
      ? 'wr-badge wr-badge--warn'
      : 'wr-badge wr-badge--error';
  }

  limpiarBusqueda(): void {
    this.searchReference = '';
    this.searchWompiTxId = '';
    this.searchEmail = '';
    this.searchCheckoutId = '';
    this.searchEmail = '';
    this.result = null;
    this.searchError = null;
  }

  hasComprasMaterializadas(result: WompiReconcileLookupResult | null): boolean {
    if (!result?.compras) return false;
    const c = result.compras;
    return !!(c['compra_boletas'] || c['compra_productos'] || c['compra_cover']);
  }

  getCompraBoletas(result: WompiReconcileLookupResult | null): Record<string, unknown> | null {
    return (result?.compras?.['compra_boletas'] as Record<string, unknown>) ?? null;
  }

  getCompraProductos(result: WompiReconcileLookupResult | null): Record<string, unknown> | null {
    return (result?.compras?.['compra_productos'] as Record<string, unknown>) ?? null;
  }

  getCompraCover(result: WompiReconcileLookupResult | null): Record<string, unknown> | null {
    return (result?.compras?.['compra_cover'] as Record<string, unknown>) ?? null;
  }

  getAlignmentBadge(result: WompiReconcileLookupResult | null): { label: string; class: string } {
    if (!result) return { label: '—', class: 'wr-badge wr-badge--neutral' };
    if (result.requiere_accion) {
      return { label: 'Requiere acción', class: 'wr-badge wr-badge--error' };
    }
    const wompiOk = result.wompi?.status === 'APPROVED';
    const materializado = result.checkout?.materializado;
    if (wompiOk && materializado) {
      return { label: 'Alineado', class: 'wr-badge wr-badge--ok' };
    }
    if (wompiOk && !materializado) {
      return { label: 'Aprobado sin materializar', class: 'wr-badge wr-badge--warn' };
    }
    return { label: 'Revisar', class: 'wr-badge wr-badge--neutral' };
  }

  getStatusBadgeClass(status: string | undefined | null): string {
    const s = (status || '').toLowerCase();
    if (s === 'aprobada' || s === 'approved' || s === 'completada' || s === 'pagada') {
      return 'wr-badge wr-badge--ok';
    }
    if (s === 'pendiente' || s === 'pending') {
      return 'wr-badge wr-badge--warn';
    }
    if (s === 'rechazada' || s === 'declined' || s === 'error' || s === 'expirada') {
      return 'wr-badge wr-badge--error';
    }
    return 'wr-badge wr-badge--neutral';
  }

  getWompiStatusBadge(status: string): string {
    const s = status.toUpperCase();
    if (s === 'APPROVED') return 'wr-badge wr-badge--ok';
    if (s === 'PENDING') return 'wr-badge wr-badge--warn';
    if (s === 'DECLINED' || s === 'ERROR' || s === 'VOIDED') return 'wr-badge wr-badge--error';
    return 'wr-badge wr-badge--neutral';
  }

  getDiagnosticoIcon(nivel: string): string {
    if (nivel === 'ok') return 'check_circle';
    if (nivel === 'warning') return 'warning';
    if (nivel === 'error') return 'error';
    return 'info';
  }

  getClienteLabel(checkout: { cliente?: { nombre?: string | null; apellido?: string | null; email?: string | null } | null; id?: number }): string {
    const c = checkout.cliente;
    if (!c) return checkout.id ? `Checkout #${checkout.id}` : '—';
    const nombre = [c.nombre, c.apellido].filter(Boolean).join(' ').trim();
    return nombre || c.email || '—';
  }

  diagnosticoClass(item: WompiDiagnosticoItem): string {
    if (item.nivel === 'ok') return 'wr-diag-item wr-diag-item--ok';
    if (item.nivel === 'warning') return 'wr-diag-item wr-diag-item--warning';
    if (item.nivel === 'error') return 'wr-diag-item wr-diag-item--error';
    return 'wr-diag-item wr-diag-item--info';
  }

  formatWompiAmount(cents?: number, currency?: string): string {
    if (cents == null) return '—';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: currency || 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  }

  formatCompraTotal(compra: Record<string, unknown> | null): string {
    if (!compra) return '—';
    return this.formatCurrency(Number(compra['total'] ?? 0), String(compra['moneda'] ?? 'COP'));
  }

  formatRecordEstado(value: unknown): string {
    return value != null ? String(value) : '—';
  }

  getBoletasTipos(compra: Record<string, unknown> | null): Array<{ nombre: string; count: number }> {
    return this.getCompraItemsResumen(compra, 'tipos_boleta');
  }

  getCompraItemsResumen(
    compra: Record<string, unknown> | null,
    field: string,
  ): Array<{ nombre: string; count: number }> {
    const raw = compra?.[field];
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item) => {
        const row = item as Record<string, unknown>;
        const nombre = String(row['nombre'] ?? '').trim();
        const count = Number(row['count'] ?? 0);
        if (!nombre || !Number.isFinite(count) || count <= 0) return null;
        return { nombre, count };
      })
      .filter((item): item is { nombre: string; count: number } => item != null);
  }

  getCompraItemsTotal(compra: Record<string, unknown> | null, field: string): number {
    return this.getCompraItemsResumen(compra, field).reduce((sum, item) => sum + item.count, 0);
  }

  formatCurrency(value: number | undefined | null, moneda?: string | null): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: moneda || 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Number(value || 0));
  }

  private parsePositiveInt(value: string | number | null | undefined): number | null {
    if (value == null || value === '') {
      return null;
    }
    const n = typeof value === 'number' ? value : Number(String(value).trim());
    return Number.isInteger(n) && n > 0 ? n : null;
  }
}
