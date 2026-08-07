import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { DashboardService } from '../../services/dashboard.service';
import { AuthService } from '../../services/auth.service';
import { AppCacheService } from '../../services/app-cache.service';
import { AlertService } from '../../services/alert.service';
import { DashboardStats } from '../../types';
import { formatFinanzasMonedaExacta, buildFinanzasOrganizadorView, formatFinanzasMontoExacto } from '../../utils/dashboard-finanzas.view';
import { IngresosResumenComponent } from '../../components/ingresos-resumen/ingresos-resumen';

export type DashOrgAttentionTone = 'warn' | 'ok' | 'info';

export interface DashOrgAttentionItem {
  key: string;
  tone: DashOrgAttentionTone;
  title: string;
  message: string;
  actionLabel: string;
  actionRoute: string | any[];
}

export interface DashOrgActivityItem {
  key: string;
  timeLabel: string;
  message: string;
  detail?: string;
}

export interface DashOrgRankingItem {
  key: string;
  rank: number;
  medal: string;
  title: string;
  pct: number;
  boletas: number;
  eventoId?: number;
}

@Component({
  selector: 'app-dashboard-organizador',
  imports: [CommonModule, RouterModule, IngresosResumenComponent],
  templateUrl: './dashboard-organizador.html',
  styleUrls: ['./dashboard-organizador.css', '../dashboard/dashboard.css'],
})
export class DashboardOrganizador implements OnInit {
  private readonly cacheTtlMs = 60 * 1000;
  isManualRefreshing = false;

  constructor(
    private dashboardService: DashboardService,
    private authService: AuthService,
    private appCacheService: AppCacheService,
    private alertService: AlertService,
    private cdr: ChangeDetectorRef
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
    top_eventos: []
  };
  
  loading = true;
  error: string | null = null;
  organizadorId: number | null = null;

  ngOnInit() {
    const unsubscribe = this.authService.onAuthStateChange((user, usuario, session) => {
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
      console.info('[DashboardOrganizador] Sin conexión, usando datos cacheados');
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
    const startedAt = Date.now();
    this.loading = !background && !hasVisibleData;
    this.error = null;
    this.cdr.detectChanges();

    try {
      const stats = await this.dashboardService.getStats({ organizadorId: this.organizadorId });
      this.stats = stats;
      this.loading = false;
      this.persistState();
      if (manual) {
        void this.alertService.snackbarSuccess('Dashboard actualizado', 'Los datos del organizador se recargaron.');
      }
      console.log('[DashboardOrganizador] Carga finalizada', {
        background,
        durationMs: Date.now() - startedAt,
        organizadorId: this.organizadorId
      });
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
    this.appCacheService.set(key, {
      stats: this.stats,
      lastUpdated: Date.now()
    }, 'session');
  }

  formatCurrency(value: number): string {
    return formatFinanzasMonedaExacta(value);
  }

  formatAmount(value: number | null | undefined): string {
    return formatFinanzasMontoExacto(value);
  }

  get mostrarProductos(): boolean {
    return !!this.stats.tiene_productos;
  }

  get finanzasConsolidado() {
    return buildFinanzasOrganizadorView(this.stats, this.mostrarProductos);
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

  get heroTitle(): string {
    if (this.usuarioNombre) {
      return `${this.saludo}, ${this.usuarioNombre}`;
    }
    return 'Panel del organizador';
  }

  get heroStatusLine(): string {
    const activos = this.stats.eventos_activos ?? 0;
    const proximos = this.stats.eventos_proximos?.length ?? 0;
    if (activos === 0 && proximos === 0) {
      return 'Crea y publica un evento para comenzar a vender.';
    }
    if (activos > 0 && proximos > 0) {
      return 'Todo listo para comenzar la jornada.';
    }
    if (activos > 0) {
      return 'Tus eventos activos están listos para operar.';
    }
    return 'Tienes eventos en preparación.';
  }

  get proximosEventosCount(): number {
    return this.stats.eventos_proximos?.length ?? 0;
  }

  get tasaAsistenciaDisplay(): number {
    if (this.stats.tasa_asistencia != null && Number.isFinite(this.stats.tasa_asistencia)) {
      return Math.round(this.stats.tasa_asistencia);
    }
    const vendidas = this.stats.boletas_vendidas ?? 0;
    if (vendidas <= 0) return 0;
    const usadas = this.stats.boletas_por_estado?.find((item) => item.estado === 'usada')?.cantidad ?? 0;
    return Math.round((usadas / vendidas) * 100);
  }

  get attentionItems(): DashOrgAttentionItem[] {
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
          // queryParams handled in template via routerLink queryParams if needed - use array with query
        });
        continue;
      }

      const days = this.daysUntil(evento?.fecha_inicio);
      if (days != null && days >= 0 && days <= 14) {
        items.push({
          key: `soon-${id}`,
          tone: 'ok',
          title: titulo,
          message: days === 0
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
      items.push({
        key: `top-${id}`,
        tone: 'info',
        title: String(evento?.titulo || 'Evento'),
        message: pct >= 100
          ? `Lidera tus ventas con ${this.formatAmount(vendidas)} boletas.`
          : `Representa el ${pct}% de tu mejor evento en ventas.`,
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

  get activityFeed(): DashOrgActivityItem[] {
    return (this.stats.ventas_recientes ?? []).map((venta, index) => {
      const eventoTitulo = venta?.evento?.titulo ? String(venta.evento.titulo) : undefined;
      const tipo = venta?.tipo_venta;
      let message = 'Nueva venta registrada.';
      if (tipo === 'productos') {
        message = eventoTitulo
          ? `Se vendieron productos en ${eventoTitulo}.`
          : 'Se vendieron productos.';
      } else if (tipo === 'mixta') {
        message = eventoTitulo
          ? `Compra mixta completada en ${eventoTitulo}.`
          : 'Compra mixta completada.';
      } else {
        message = eventoTitulo
          ? `Se vendieron entradas en ${eventoTitulo}.`
          : 'Se vendieron entradas.';
      }

      return {
        key: `${venta?.numero_transaccion || venta?.id || index}`,
        timeLabel: this.formatRelativeTime(venta?.fecha_compra),
        message,
        detail: venta?.total != null && Number(venta.total) > 0
          ? this.formatCurrency(Number(venta.total))
          : undefined,
      };
    });
  }

  get rankingItems(): DashOrgRankingItem[] {
    const medals = ['🥇', '🥈', '🥉'];
    const top = this.stats.top_eventos ?? [];
    const leader = top[0]?.boletas_vendidas ?? 0;

    return top.map((evento, index) => {
      const boletas = Number(evento?.boletas_vendidas ?? 0);
      const pct = leader > 0 ? Math.round((boletas / leader) * 100) : 0;
      return {
        key: `rank-${evento?.id ?? index}`,
        rank: index + 1,
        medal: medals[index] ?? `${index + 1}.`,
        title: String(evento?.titulo || 'Evento'),
        pct,
        boletas,
        eventoId: evento?.id,
      };
    });
  }

  get defaultEventoId(): number | null {
    const proximo = this.stats.eventos_proximos?.[0]?.id;
    if (proximo) return Number(proximo);
    const top = this.stats.top_eventos?.[0]?.id;
    return top ? Number(top) : null;
  }

  get cuponesRoute(): any[] {
    const id = this.defaultEventoId;
    return id ? ['/eventos', id, 'operaciones'] : ['/eventos'];
  }

  daysUntil(fecha: string | Date | null | undefined): number | null {
    if (!fecha) return null;
    const start = new Date(typeof fecha === 'string' ? fecha : fecha.toISOString());
    if (Number.isNaN(start.getTime())) return null;
    const diffMs = start.getTime() - Date.now();
    return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
  }

  formatAgendaDate(fecha: string | Date | null | undefined): string {
    if (!fecha) return '—';
    const date = new Date(typeof fecha === 'string' ? fecha : fecha.toISOString());
    if (Number.isNaN(date.getTime())) return '—';
    const day = date.getDate();
    const month = date.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '');
    const monthCap = month.charAt(0).toUpperCase() + month.slice(1);
    return `${day} ${monthCap}`;
  }

  formatRelativeTime(fecha: string | Date | null | undefined): string {
    if (!fecha) return 'Recientemente';
    const then = new Date(typeof fecha === 'string' ? fecha : fecha.toISOString()).getTime();
    if (!Number.isFinite(then)) return 'Recientemente';
    const diffMs = Date.now() - then;
    if (diffMs < 60_000) return 'Hace un momento';
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 60) return mins === 1 ? 'Hace 1 minuto' : `Hace ${mins} minutos`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return hours === 1 ? 'Hace 1 hora' : `Hace ${hours} horas`;
    const days = Math.floor(hours / 24);
    return days === 1 ? 'Hace 1 día' : `Hace ${days} días`;
  }

  getVariacionPorcentual(actual: number, anterior: number): number {
    if (anterior === 0) return actual > 0 ? 100 : 0;
    return Math.round(((actual - anterior) / anterior) * 100);
  }

  getEstadoBoletaLabel(estado: string): string {
    const estados: { [key: string]: string } = {
      'pendiente': 'Pendiente',
      'usada': 'Usada',
      'cancelada': 'Cancelada',
      'reembolsada': 'Reembolsada'
    };
    return estados[estado] || estado;
  }

  attentionQueryParams(item: DashOrgAttentionItem): Record<string, string | number> | null {
    if (item.actionLabel === 'Publicar' && Array.isArray(item.actionRoute) && item.actionRoute[0] === '/eventos') {
      const id = Number(item.key.replace('draft-', ''));
      if (Number.isFinite(id) && id > 0) {
        return { edit: id };
      }
    }
    return null;
  }

  Math = Math;
}
