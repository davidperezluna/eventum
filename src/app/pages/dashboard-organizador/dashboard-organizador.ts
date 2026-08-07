import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { DemoDataProvider } from '../../demo/demo-data.provider';
import { AuthService } from '../../services/auth.service';
import { AppCacheService } from '../../services/app-cache.service';
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
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard-organizador.html',
  styleUrls: [
    '../evento-inteligencia/evento-inteligencia.css',
    './dashboard-organizador.css',
  ],
})
export class DashboardOrganizador implements OnInit {
  private readonly cacheTtlMs = 60 * 1000;
  isManualRefreshing = false;
  readonly padCountdown = padCountdown;

  constructor(
    private demoDataProvider: DemoDataProvider,
    private authService: AuthService,
    private appCacheService: AppCacheService,
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
        const cached = this.getCachedState();
        if (cached) {
          this.stats = cached.stats;
          this.loading = false;
          this.cdr.detectChanges();
        } else {
          this.loading = true;
        }
        void this.loadStats({ background: !!cached });
        unsubscribe();
      } else if (usuario !== null) {
        this.error = 'No se pudo identificar el organizador';
        this.loading = false;
        unsubscribe();
      }
    });
  }

  async loadStats(options?: { background?: boolean; manual?: boolean }) {
    if (!this.organizadorId) {
      this.error = 'ID de organizador no disponible';
      this.loading = false;
      return;
    }

    const hasVisibleData = !this.loading;
    const background = options?.background ?? hasVisibleData;
    const manual = options?.manual ?? false;
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;

    if (offline && hasVisibleData) {
      if (manual) {
        void this.alertService.snackbar('Sin conexión. Mostrando datos guardados.');
      }
      return;
    }

    if (manual && this.isManualRefreshing) return;
    if (manual) {
      this.isManualRefreshing = true;
      this.cdr.detectChanges();
    }

    this.loading = !background && !hasVisibleData;
    this.error = null;
    this.cdr.detectChanges();

    try {
      const stats = await this.demoDataProvider.getOrganizerDashboardStats(this.organizadorId);
      this.stats = stats;
      this.loading = false;
      this.persistState();
      if (manual) {
        void this.alertService.snackbarSuccess('Dashboard actualizado', 'Los datos del organizador se recargaron.');
      }
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando estadísticas:', err);
      this.error = 'Error al cargar las estadísticas. Verifica tu conexión con Supabase.';
      this.loading = false;
      if (manual) {
        void this.alertService.snackbarError('No se pudo recargar', 'Ocurrió un error al actualizar el dashboard.');
      }
      this.cdr.detectChanges();
    } finally {
      if (manual) {
        this.isManualRefreshing = false;
        this.cdr.detectChanges();
      }
    }
  }

  get intel(): DashboardOrgIntelView | null {
    if (this.loading || this.error) return null;
    return buildDashboardOrgIntelView({
      stats: this.stats,
      saludo: this.saludo,
      usuarioNombre: this.usuarioNombre,
      daysUntil: (f) => this.daysUntil(f),
      formatCurrency: (v) => this.formatCurrency(v),
      formatAmount: (v) => this.formatAmount(v),
      attentionItems: this.buildAttentionItems(),
    });
  }

  get actionNowQueryParams(): Record<string, string | number> | null {
    const action = this.intel?.actionNow;
    const route = this.intel?.actionNowRoute;
    if (!action || !route) return null;
    if (action.ctaLabel === 'Publicar' && Array.isArray(route) && route[0] === '/eventos') {
      const item = this.filteredAttentionItems[0];
      if (item?.key.startsWith('draft-')) {
        const id = Number(item.key.replace('draft-', ''));
        if (Number.isFinite(id) && id > 0) return { edit: id };
      }
    }
    return null;
  }

  eventoIntelRoute(rowIndex: number): any[] {
    const id = this.intel?.eventoIdsByRow[rowIndex];
    return id ? ['/eventos', id, 'inteligencia'] : ['/eventos'];
  }

  /** Primer evento próximo — acceso rápido desde el portafolio sin rutas globales. */
  get proximoEventoOperacionesRoute(): any[] | null {
    const raw = this.stats.eventos_proximos?.[0]?.id;
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0) return null;
    return ['/eventos', id, 'operaciones'];
  }

  private get filteredAttentionItems(): DashOrgAttentionItem[] {
    const hero = this.intel?.heroIdentity;
    if (!hero) return this.buildAttentionItems();
    return filterAttentionForHero(this.buildAttentionItems(), hero);
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

  private get cacheKey(): string | null {
    if (!this.organizadorId) return null;
    return `eventum:cache:v1:dashboard-organizador:user:${this.organizadorId}`;
  }

  private getCachedState(): { stats: DashboardStats; lastUpdated: number } | null {
    const key = this.cacheKey;
    if (!key) return null;
    const cached = this.appCacheService.get<{ stats: DashboardStats; lastUpdated: number }>(key, 'session');
    if (!cached) return null;
    if (Date.now() - cached.lastUpdated > this.cacheTtlMs) return null;
    return cached;
  }

  private persistState(): void {
    const key = this.cacheKey;
    if (!key) return;
    this.appCacheService.set(key, { stats: this.stats, lastUpdated: Date.now() }, 'session');
  }

  formatCurrency(value: number): string {
    return formatFinanzasMonedaExacta(value);
  }

  formatAmount(value: number | null | undefined): string {
    return formatFinanzasMontoExacto(value);
  }

  daysUntil(fecha: string | Date | null | undefined): number | null {
    if (!fecha) return null;
    const start = new Date(typeof fecha === 'string' ? fecha : fecha.toISOString());
    if (Number.isNaN(start.getTime())) return null;
    const diffMs = start.getTime() - Date.now();
    return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
  }
}
