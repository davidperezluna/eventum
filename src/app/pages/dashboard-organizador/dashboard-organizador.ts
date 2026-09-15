import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { OrgSalesRow, OrgSalesRowModel } from '../../components/org-sales-row';
import { DemoDataProvider } from '../../demo/demo-data.provider';
import { AuthService } from '../../services/auth.service';
import { AlertService } from '../../services/alert.service';
import { DashboardStats } from '../../types';
import { formatFinanzasMonedaExacta, formatFinanzasMontoExacto } from '../../utils/dashboard-finanzas.view';
import { padCountdown } from '../evento-inteligencia/evento-inteligencia.utils';
import {
  buildDashboardOrgIntelView,
  DashboardOrgIntelView,
} from './dashboard-organizador-intel.adapter';
import {
  DashOrgAttentionItem,
  filterAttentionForHero,
} from './dashboard-organizador.view';

@Component({
  selector: 'app-dashboard-organizador',
  imports: [CommonModule, RouterModule, OrgSalesRow],
  templateUrl: './dashboard-organizador.html',
  styleUrls: [
    '../evento-inteligencia/evento-inteligencia.css',
    './dashboard-organizador.css',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardOrganizador implements OnInit {
  isManualRefreshing = false;
  readonly padCountdown = padCountdown;

  /** Vista ya materializada: no reconstruir en cada CD (menú / refresh). */
  intelView: DashboardOrgIntelView | null = null;
  actionNowQueryParams: Record<string, string | number> | null = null;

  constructor(
    private demoDataProvider: DemoDataProvider,
    private authService: AuthService,
    private alertService: AlertService,
    private cdr: ChangeDetectorRef,
  ) {}

  stats: DashboardStats = {
    eventos_activos: 0,
    boletas_vendidas: 0,
    productos_vendidos: 0,
    pedidos_productos: 0,
    tiene_productos: false,
    ingresos_totales: 0,
    ingresos_productos_totales: 0,
    clientes: 0,
    ventas_recientes: [],
    eventos_proximos: [],
    eventos_totales: 0,
    categorias_activas: 0,
    lugares_activos: 0,
    ingresos_mes_actual: 0,
    ingresos_mes_anterior: 0,
    ingresos_dia_actual: 0,
    ingresos_dia_anterior: 0,
    porcentaje_servicio_promedio: 0,
    valor_servicio_total: 0,
    porcentaje_servicio_productos_promedio: 0,
    valor_servicio_productos_total: 0,
    ingresos_ventas_bruto_total: 0,
    ingresos_productos_bruto_total: 0,
    wompi_total_estimado: 0,
    wompi_productos_total_estimado: 0,
    wompi_ventas_total: 0,
    wompi_productos_ventas_total: 0,
    wompi_servicio_total: 0,
    wompi_productos_servicio_total: 0,
    neto_ventas_post_wompi_total: 0,
    neto_productos_ventas_post_wompi_total: 0,
    neto_servicio_post_wompi_total: 0,
    neto_productos_servicio_post_wompi_total: 0,
    neto_total_post_wompi_total: 0,
    neto_productos_total_post_wompi_total: 0,
    boletas_por_estado: [],
    top_eventos: [],
  };

  loading = true;
  error: string | null = null;
  organizadorId: number | null = null;

  ngOnInit() {
    const unsubscribe = this.authService.onAuthStateChange((user, usuario) => {
      if (usuario && usuario.tipo_usuario_id === 2) {
        this.organizadorId = usuario.id;
        this.loading = true;
        this.error = null;
        this.intelView = null;
        this.cdr.markForCheck();
        void this.loadStats();
        unsubscribe();
      } else if (usuario !== null) {
        this.error = 'No se pudo identificar el organizador';
        this.loading = false;
        this.intelView = null;
        this.cdr.markForCheck();
        unsubscribe();
      }
    });
  }

  async loadStats(options?: { manual?: boolean }) {
    if (!this.organizadorId) {
      this.error = 'ID de organizador no disponible';
      this.loading = false;
      this.intelView = null;
      this.cdr.markForCheck();
      return;
    }

    const manual = options?.manual ?? false;
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;

    if (offline) {
      if (manual) {
        void this.alertService.snackbar('Sin conexión. Intenta de nuevo cuando vuelva la red.');
      } else {
        this.error = 'Sin conexión. Verifica tu red e intenta de nuevo.';
        this.loading = false;
        this.intelView = null;
        this.cdr.markForCheck();
      }
      return;
    }

    if (manual && this.isManualRefreshing) return;
    if (manual) {
      this.isManualRefreshing = true;
      this.cdr.detectChanges();
      await new Promise<void>((resolve) => {
        if (typeof requestAnimationFrame === 'undefined') {
          resolve();
          return;
        }
        requestAnimationFrame(() => resolve());
      });
    } else {
      this.loading = true;
      this.intelView = null;
      this.cdr.markForCheck();
    }

    this.error = null;

    try {
      const stats = await this.demoDataProvider.getOrganizerDashboardStats(this.organizadorId);
      this.stats = stats;
      this.loading = false;
      this.rebuildIntelView();
      if (manual) {
        void this.alertService.snackbarSuccess('Dashboard actualizado', 'Los datos del organizador se recargaron.');
      }
      this.cdr.markForCheck();
    } catch (err) {
      console.error('Error cargando estadísticas:', err);
      this.error = 'Error al cargar las estadísticas. Verifica tu conexión con Supabase.';
      this.loading = false;
      this.intelView = null;
      if (manual) {
        void this.alertService.snackbarError('No se pudo recargar', 'Ocurrió un error al actualizar el dashboard.');
      }
      this.cdr.markForCheck();
    } finally {
      if (manual) {
        this.isManualRefreshing = false;
        this.cdr.markForCheck();
      }
    }
  }

  private rebuildIntelView(): void {
    if (this.loading || this.error) {
      this.intelView = null;
      this.actionNowQueryParams = null;
      return;
    }
    const attentionItems = this.buildAttentionItems();
    this.intelView = buildDashboardOrgIntelView({
      stats: this.stats,
      saludo: this.saludo,
      usuarioNombre: this.usuarioNombre,
      daysUntil: (f) => this.daysUntil(f),
      formatCurrency: (v) => this.formatCurrency(v),
      formatAmount: (v) => this.formatAmount(v),
      attentionItems,
    });

    const action = this.intelView.actionNow;
    const route = this.intelView.actionNowRoute;
    this.actionNowQueryParams = null;
    if (
      action?.ctaLabel === 'Publicar' &&
      Array.isArray(route) &&
      route[0] === '/eventos'
    ) {
      const item = filterAttentionForHero(attentionItems, this.intelView.heroIdentity)[0];
      if (item?.key.startsWith('draft-')) {
        const id = Number(item.key.replace('draft-', ''));
        if (Number.isFinite(id) && id > 0) {
          this.actionNowQueryParams = { edit: id };
        }
      }
    }
  }

  eventoIntelRoute(rowIndex: number): any[] {
    const id = this.intelView?.eventoIdsByRow[rowIndex];
    return id ? ['/eventos', id, 'inteligencia'] : ['/eventos'];
  }

  get saludo(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Buenos días';
    if (hour < 19) return 'Buenas tardes';
    return 'Buenas noches';
  }

  get usuarioNombre(): string {
    const nombre = this.authService.getUsuario()?.nombre?.trim();
    if (!nombre) return '';
    return nombre.split(/\s+/)[0];
  }

  private buildAttentionItems(): DashOrgAttentionItem[] {
    const items: DashOrgAttentionItem[] = [];
    const seen = new Set<number>();

    for (const evento of this.stats.eventos_proximos ?? []) {
      const id = Number(evento?.id);
      if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
      seen.add(id);

      const titulo = String(evento?.titulo || 'Evento sin título');
      const estado = String(evento?.estado || '').toLowerCase();

      if (estado && estado !== 'publicado') {
        items.push({
          key: `draft-${id}`,
          tone: 'warn',
          title: titulo,
          message: 'Publica este evento para comenzar a vender.',
          actionLabel: 'Publicar',
          actionRoute: ['/eventos'],
        });
        continue;
      }

      const days = this.daysUntil(evento?.fecha_inicio);
      if (days != null && days >= 0 && days <= 14) {
        items.push({
          key: `soon-${id}`,
          tone: 'ok',
          title: titulo,
          message:
            days === 0
              ? 'Tu evento es hoy. Todo listo.'
              : days === 1
                ? 'Falta 1 día. Todo listo.'
                : `Faltan ${days} días. Todo listo.`,
          actionLabel: 'Abrir panel',
          actionRoute: ['/eventos', id, 'operaciones'],
        });
      }
    }

    const topLeader = (this.stats.top_eventos ?? [])[0]?.boletas_vendidas ?? 0;
    for (const evento of this.stats.top_eventos ?? []) {
      if (items.length >= 5) break;
      const id = Number(evento?.id);
      if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
      const vendidas = Number(evento?.boletas_vendidas ?? 0);
      if (vendidas <= 0) continue;
      seen.add(id);

      const pct = topLeader > 0 ? Math.round((vendidas / topLeader) * 100) : 0;
      if (pct >= 100) continue;

      items.push({
        key: `top-${id}`,
        tone: 'info',
        title: String(evento?.titulo || 'Evento'),
        message: `Representa el ${pct}% de tu evento líder en ventas — haz zoom para profundizar.`,
        actionLabel: 'Ver inteligencia',
        actionRoute: ['/eventos', id, 'inteligencia'],
      });
    }

    if (items.length === 0 && (this.stats.eventos_totales ?? 0) === 0) {
      items.push({
        key: 'empty',
        tone: 'warn',
        title: 'Sin eventos todavía',
        message: 'Crea tu primer evento para comenzar a vender entradas.',
        actionLabel: 'Crear evento',
        actionRoute: ['/eventos'],
      });
    }

    return items.slice(0, 5);
  }

  formatCurrency(value: number): string {
    return formatFinanzasMonedaExacta(value);
  }

  formatAmount(value: number | null | undefined): string {
    return formatFinanzasMontoExacto(value);
  }

  trackActivity(_: number, item: OrgSalesRowModel): string {
    return item.key;
  }

  daysUntil(fecha: string | Date | null | undefined): number | null {
    if (!fecha) return null;
    const start = new Date(typeof fecha === 'string' ? fecha : fecha.toISOString());
    if (Number.isNaN(start.getTime())) return null;
    const diffMs = start.getTime() - Date.now();
    return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
  }
}
