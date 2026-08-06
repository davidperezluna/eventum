import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DateFormatPipe } from '../../pipes/date-format.pipe';
import { AlertService } from '../../services/alert.service';
import {
  WompiDiagnosticoItem,
  WompiReconcileLookupResult,
  WompiReconcileOrphanRow,
  WompiReconcileService,
} from '../../services/wompi-reconcile.service';

type TabId = 'buscar' | 'huerfanos';

@Component({
  selector: 'app-wompi-reconcile',
  imports: [CommonModule, FormsModule, DateFormatPipe, RouterLink],
  templateUrl: './wompi-reconcile.html',
  styleUrl: './wompi-reconcile.css',
})
export class WompiReconcile implements OnInit {
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
    if (matchType === 'comprobante_wompi') {
      return 'Correo en comprobante Wompi';
    }
    if (matchType === 'cuenta_eventum') {
      return 'Cuenta Eventum';
    }
    return matchType;
  }

  emailsDifferen(result: WompiReconcileLookupResult | null): boolean {
    return result?.email_context?.emails_coinciden === false;
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
