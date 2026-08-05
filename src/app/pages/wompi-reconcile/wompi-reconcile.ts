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
  searchCheckoutId = '';
  searchCompraId = '';

  loading = false;
  syncingId: number | null = null;
  result: WompiReconcileLookupResult | null = null;

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
    const checkoutId = this.parsePositiveInt(this.searchCheckoutId);
    const compraId = this.parsePositiveInt(this.searchCompraId);

    if (!reference && !wompiTx && !checkoutId && !compraId) {
      this.alertService.warning('Búsqueda', 'Indica al menos un criterio de búsqueda.');
      return;
    }

    this.loading = true;
    this.result = null;
    this.cdr.detectChanges();

    try {
      this.result = await this.wompiReconcileService.lookup({
        reference: reference || undefined,
        wompi_transaction_id: wompiTx || undefined,
        transaccion_checkout_id: checkoutId ?? undefined,
        compra_id: compraId ?? undefined,
      });
      if (!this.result.success) {
        this.alertService.error('Sin resultados', this.result.error || 'No se pudo consultar.');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error inesperado';
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
    this.searchCompraId = '';
    void this.buscar();
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

  getClienteLabel(checkout: { cliente?: { nombre?: string | null; apellido?: string | null; email?: string | null } | null; id?: number }): string {
    const c = checkout.cliente;
    if (!c) return checkout.id ? `Checkout #${checkout.id}` : '—';
    const nombre = [c.nombre, c.apellido].filter(Boolean).join(' ').trim();
    return nombre || c.email || '—';
  }

  diagnosticoClass(item: WompiDiagnosticoItem): string {
    if (item.nivel === 'ok') return 'diag diag--ok';
    if (item.nivel === 'warning') return 'diag diag--warning';
    if (item.nivel === 'error') return 'diag diag--error';
    return 'diag diag--info';
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

  formatCurrency(value: number | undefined | null, moneda?: string | null): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: moneda || 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Number(value || 0));
  }

  private parsePositiveInt(value: string): number | null {
    const n = Number(value.trim());
    return Number.isInteger(n) && n > 0 ? n : null;
  }
}
