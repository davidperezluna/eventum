import { CuponDescuento, DashboardStats, Evento, Producto, TipoBoleta, TipoEstadoEvento } from '../types';
import { ReporteEvento, ReporteVentas } from '../services/reportes.service';
import { DemoScenarioDefinition } from './demo-scenario.interface';
import {
  DemoBuildContext,
  DemoEventoPresentationHints,
  DemoScenarioMeta,
  DemoScenarioParams,
} from './demo-scenario.types';
import {
  buildBoletasPorEstado,
  buildReporteFromMetrics,
  buildVentas7dSeries,
  buildVentasRecientesFeed,
  clientesFromBoletas,
  distributeTiposVendidas,
  emptyDashboardStats,
  eventosProximosFromContext,
  ingresosDiaFromSeries,
  mergeFinanzasIntoStats,
  pickHeroEvento,
  topEventosFromContext,
} from './demo-stats.builder';
import { DemoEventMetrics, resolveEventMetrics } from './demo-scenario.metrics';

/**
 * Implementación base compartida. Cada escenario concreto define meta, defaults
 * y opcionalmente ajustes de métricas vía hooks protegidos.
 */
export abstract class DemoBaseScenario implements DemoScenarioDefinition {
  abstract readonly meta: DemoScenarioMeta;
  abstract readonly defaultParams: DemoScenarioParams;

  /** Métricas del evento protagonista; escenarios concretos pueden sobreescribir. */
  protected resolveHeroMetrics(ctx: DemoBuildContext, params: DemoScenarioParams): DemoEventMetrics {
    const hero = pickHeroEvento(ctx);
    if (!hero) {
      return resolveEventMetrics(ctx, params, 0, {
        boletasVendidas: 0,
        boletasUsadas: 0,
        productosVendidos: 0,
        cuponesUsados: 0,
        clientes: 0,
        recaudoBoletas: 0,
        recaudoProductos: 0,
      });
    }
    return resolveEventMetrics(ctx, params, hero.id);
  }

  protected resolveEventMetricsFor(
    ctx: DemoBuildContext,
    params: DemoScenarioParams,
    eventoId: number,
  ): DemoEventMetrics {
    return resolveEventMetrics(ctx, params, eventoId);
  }

  protected feedCount(_ctx: DemoBuildContext, _params: DemoScenarioParams, metrics: DemoEventMetrics): number {
    return metrics.boletasVendidas > 0 ? 5 : 0;
  }

  protected ventas7dPeakToday(_ctx: DemoBuildContext, _params: DemoScenarioParams): boolean {
    return true;
  }

  protected includeSecondaryDraft(_ctx: DemoBuildContext, _params: DemoScenarioParams): boolean {
    return false;
  }

  protected organizerEventosActivos(_ctx: DemoBuildContext, params: DemoScenarioParams): number {
    return Math.min(Math.max(1, params.eventosEnCartera), 3);
  }

  buildOrganizerDashboard(ctx: DemoBuildContext, params: DemoScenarioParams): DashboardStats {
    const hero = pickHeroEvento(ctx);
    const metrics = this.resolveHeroMetrics(ctx, params);
    const ventas7d = this.buildVentasPorDia(ctx, params, hero?.id ?? 0);
    const { hoy, ayer } = ingresosDiaFromSeries(ventas7d);
    const base = emptyDashboardStats();
    const boletasOrg = metrics.boletasVendidas + Math.round(metrics.boletasVendidas * 0.15);
    const recaudoBoletas = metrics.recaudoBoletas + Math.round(metrics.recaudoBoletas * 0.12);
    const recaudoProductos = metrics.recaudoProductos;

    const proximos = eventosProximosFromContext(ctx, params.diasAlEvento);
    if (this.includeSecondaryDraft(ctx, params) && ctx.eventos.length > 1) {
      const secondary = ctx.eventos.find((e) => e.id !== hero?.id);
      if (secondary && !proximos.some((e) => e.id === secondary.id)) {
        proximos.push({ ...secondary, estado: TipoEstadoEvento.BORRADOR });
      }
    }

    const extra: Partial<DashboardStats> = {
      eventos_activos: this.organizerEventosActivos(ctx, params),
      eventos_totales: Math.max(params.eventosEnCartera, ctx.eventos.length),
      boletas_vendidas: boletasOrg,
      productos_vendidos: metrics.productosVendidos,
      pedidos_productos: Math.max(1, Math.round(metrics.productosVendidos / 2.4)),
      tiene_productos: metrics.productosVendidos > 0,
      clientes: clientesFromBoletas(boletasOrg),
      ventas_recientes: buildVentasRecientesFeed(
        ctx,
        hero,
        this.feedCount(ctx, params, metrics),
        metrics.precioPromedioBoleta * 1.08,
      ),
      eventos_proximos: proximos,
      ingresos_mes_actual: Math.round((recaudoBoletas + recaudoProductos) * 0.88),
      ingresos_mes_anterior: Math.round((recaudoBoletas + recaudoProductos) * 0.62),
      ingresos_dia_actual: hoy,
      ingresos_dia_anterior: ayer,
      ventas_por_dia: ventas7d.map((v) => ({
        fecha: v.fecha,
        ventas: v.boletas_vendidas,
        ingresos: v.ingresos,
      })),
      boletas_por_estado: buildBoletasPorEstado(boletasOrg, metrics.boletasUsadas),
      top_eventos: topEventosFromContext(ctx, hero, metrics.boletasVendidas),
      tasa_asistencia:
        metrics.boletasVendidas > 0
          ? Math.round((metrics.boletasUsadas / metrics.boletasVendidas) * 100)
          : 0,
    };

    return mergeFinanzasIntoStats(base, recaudoBoletas, recaudoProductos, extra);
  }

  buildEventDashboardStats(
    ctx: DemoBuildContext,
    params: DemoScenarioParams,
    eventoId: number,
  ): DashboardStats {
    const metrics = this.resolveEventMetricsFor(ctx, params, eventoId);
    const evento = ctx.eventos.find((e) => e.id === eventoId) ?? pickHeroEvento(ctx);
    const ventas7d = this.buildVentasPorDia(ctx, params, eventoId);
    const { hoy, ayer } = ingresosDiaFromSeries(ventas7d);
    const base = emptyDashboardStats();

    const extra: Partial<DashboardStats> = {
      eventos_activos: 1,
      boletas_vendidas: metrics.boletasVendidas,
      boletas_usadas: metrics.boletasUsadas,
      productos_vendidos: metrics.productosVendidos,
      pedidos_productos: Math.max(0, Math.round(metrics.productosVendidos / 2.2)),
      tiene_productos: metrics.productosVendidos > 0,
      clientes: metrics.clientes,
      ingresos_dia_actual: hoy,
      ingresos_dia_anterior: ayer,
      boletas_por_estado: buildBoletasPorEstado(metrics.boletasVendidas, metrics.boletasUsadas),
      tasa_asistencia:
        metrics.boletasVendidas > 0
          ? Math.round((metrics.boletasUsadas / metrics.boletasVendidas) * 100)
          : 0,
      ventas_recientes: buildVentasRecientesFeed(
        ctx,
        evento,
        this.feedCount(ctx, params, metrics),
        metrics.precioPromedioBoleta,
      ),
    };

    return mergeFinanzasIntoStats(base, metrics.recaudoBoletas, metrics.recaudoProductos, extra);
  }

  buildReporteEvento(
    ctx: DemoBuildContext,
    params: DemoScenarioParams,
    eventoId: number,
  ): ReporteEvento {
    const evento = ctx.eventos.find((e) => e.id === eventoId) ?? pickHeroEvento(ctx);
    const metrics = this.resolveEventMetricsFor(ctx, params, eventoId);
    if (!evento) {
      return {
        evento_id: eventoId,
        evento_titulo: 'Evento demo',
        ingresos: 0,
        boletas_vendidas: 0,
        boletas_usadas: 0,
        clientes_unicos: 0,
        fecha_inicio: new Date().toISOString(),
        fecha_fin: new Date().toISOString(),
      };
    }
    return buildReporteFromMetrics(
      evento,
      metrics.boletasVendidas,
      metrics.boletasUsadas,
      metrics.recaudoBoletas + metrics.recaudoProductos,
      metrics.clientes,
    );
  }

  buildVentasPorDia(
    ctx: DemoBuildContext,
    params: DemoScenarioParams,
    eventoId: number,
  ): ReporteVentas[] {
    const metrics = this.resolveEventMetricsFor(ctx, params, eventoId);
    if (metrics.boletasVendidas <= 0) return [];
    return buildVentas7dSeries(
      metrics.boletasVendidas,
      metrics.recaudoBoletas + metrics.recaudoProductos,
      this.ventas7dPeakToday(ctx, params),
    );
  }

  applyTiposBoleta(
    tipos: TipoBoleta[],
    ctx: DemoBuildContext,
    params: DemoScenarioParams,
    eventoId: number,
  ): TipoBoleta[] {
    const metrics = this.resolveEventMetricsFor(ctx, params, eventoId);
    if (metrics.boletasVendidas <= 0) {
      return tipos.map((t) => ({ ...t, cantidad_vendidas: 0 }));
    }
    const list = tipos.length > 0 ? tipos : this.syntheticTipos(eventoId, params);
    return distributeTiposVendidas(list, metrics.boletasVendidas);
  }

  applyProductos(
    productos: Producto[],
    ctx: DemoBuildContext,
    params: DemoScenarioParams,
    eventoId: number,
  ): Producto[] {
    const metrics = this.resolveEventMetricsFor(ctx, params, eventoId);
    if (metrics.productosVendidos <= 0) {
      return productos.map((p) => ({ ...p, cantidad_vendidas: 0 }));
    }
    const list = productos.length > 0 ? productos : this.syntheticProductos(eventoId);
    const weights = [0.38, 0.28, 0.18, 0.16];
    let rest = metrics.productosVendidos;
    return list.map((p, idx) => {
      let vendidas: number;
      if (idx === list.length - 1) {
        vendidas = rest;
      } else {
        vendidas = Math.round(metrics.productosVendidos * (weights[idx] ?? 0.1));
        rest -= vendidas;
      }
      vendidas = Math.max(0, vendidas);
      return {
        ...p,
        cantidad_vendidas: vendidas,
        cantidad_disponibles: Math.max(0, (p.cantidad_total ?? 200) - vendidas),
      };
    });
  }

  applyCupones(
    cupones: CuponDescuento[],
    ctx: DemoBuildContext,
    params: DemoScenarioParams,
    eventoId: number,
  ): CuponDescuento[] {
    const metrics = this.resolveEventMetricsFor(ctx, params, eventoId);
    if (metrics.cuponesUsados <= 0 || cupones.length === 0) {
      return cupones;
    }
    let rest = metrics.cuponesUsados;
    return cupones.map((c, idx) => {
      const share = idx === cupones.length - 1 ? rest : Math.round(metrics.cuponesUsados / cupones.length);
      rest -= share;
      return { ...c, usos_actuales: Math.min(c.max_usos ?? share, Math.max(0, share)) };
    });
  }

  getEventoPresentationHints(
    ctx: DemoBuildContext,
    params: DemoScenarioParams,
    eventoId: number,
  ): DemoEventoPresentationHints | null {
    const hero = pickHeroEvento(ctx);
    if (!hero || hero.id !== eventoId) return null;
    return {
      estado: TipoEstadoEvento.PUBLICADO,
      fechaInicioOffsetDays: params.diasAlEvento,
    };
  }

  protected syntheticTipos(eventoId: number, params: DemoScenarioParams): TipoBoleta[] {
    const total = params.aforoTotal;
    const general = Math.round(total * 0.72);
    const vip = total - general;
    return [
      {
        id: -1,
        evento_id: eventoId,
        nombre: 'General',
        precio: 85_000,
        cantidad_total: general,
        cantidad_vendidas: 0,
        cantidad_disponibles: general,
        activo: true,
      },
      {
        id: -2,
        evento_id: eventoId,
        nombre: 'VIP',
        precio: 145_000,
        cantidad_total: vip,
        cantidad_vendidas: 0,
        cantidad_disponibles: vip,
        activo: true,
      },
    ];
  }

  protected syntheticProductos(eventoId: number): Producto[] {
    return [
      { id: -1, evento_id: eventoId, nombre: 'Cerveza artesanal', precio: 18_000, cantidad_total: 300 },
      { id: -2, evento_id: eventoId, nombre: 'Combo snack', precio: 25_000, cantidad_total: 200 },
      { id: -3, evento_id: eventoId, nombre: 'Merchandising', precio: 45_000, cantidad_total: 120 },
    ];
  }

  applyEventoHints(evento: Evento, hints: DemoEventoPresentationHints | null): Evento {
    if (!hints) return evento;
    const patched = { ...evento };
    if (hints.estado != null) patched.estado = hints.estado;
    if (hints.fechaInicioOffsetDays != null) {
      const start = new Date();
      start.setDate(start.getDate() + hints.fechaInicioOffsetDays);
      patched.fecha_inicio = start.toISOString();
      const fin = new Date(start);
      fin.setHours(fin.getHours() + 5);
      patched.fecha_fin = fin.toISOString();
    }
    return patched;
  }
}
