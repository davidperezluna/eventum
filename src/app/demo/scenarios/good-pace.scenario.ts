import { DemoBaseScenario } from '../demo-base.scenario';
import { DemoBuildContext, DemoScenarioMeta, DemoScenarioParams } from '../demo-scenario.types';
import { DemoEventMetrics } from '../demo-scenario.metrics';
import { TipoEstadoEvento } from '../../types';
import { DemoEventoPresentationHints } from '../demo-scenario.types';
import { pickHeroEvento } from '../demo-stats.builder';

/** Escenario principal comercial: evento con buen ritmo de ventas (~70% aforo). */
export class GoodPaceScenario extends DemoBaseScenario {
  readonly meta: DemoScenarioMeta = {
    id: 'good-pace',
    title: 'Buen ritmo',
    description:
      'Evento publicado con ~70% del aforo vendido, ingresos sólidos, productos activos y momentum diario. Ideal para demos comerciales.',
    badge: 'Recomendado',
  };

  readonly defaultParams: DemoScenarioParams = {
    aforoPctVendido: 70,
    diasAlEvento: 10,
    asistenciaPct: 0,
    productosVendidos: 85,
    cuponesUsados: 12,
    eventosEnCartera: 2,
    aforoTotal: 300,
  };

  protected override resolveHeroMetrics(_ctx: DemoBuildContext, params: DemoScenarioParams): DemoEventMetrics {
    const boletasVendidas = Math.round(params.aforoTotal * (params.aforoPctVendido / 100));
    const recaudoBoletas = Math.round(boletasVendidas * 92_000 * 0.97);
    const recaudoProductos = Math.round(params.productosVendidos * 28_500);
    return {
      aforoTotal: params.aforoTotal,
      boletasVendidas,
      boletasUsadas: 0,
      productosVendidos: params.productosVendidos,
      cuponesUsados: params.cuponesUsados,
      clientes: Math.max(1, Math.round(boletasVendidas * 0.68)),
      recaudoBoletas,
      recaudoProductos,
      precioPromedioBoleta: 92_000,
    };
  }

  protected override feedCount(): number {
    return 5;
  }

  protected override ventas7dPeakToday(): boolean {
    return true;
  }

  protected override includeSecondaryDraft(): boolean {
    return true;
  }

  protected override organizerEventosActivos(_ctx: DemoBuildContext, params: DemoScenarioParams): number {
    return Math.max(1, params.eventosEnCartera);
  }

  override getEventoPresentationHints(
    ctx: DemoBuildContext,
    params: DemoScenarioParams,
    eventoId: number,
  ): DemoEventoPresentationHints | null {
    const hero = pickHeroEvento(ctx);
    if (!hero) return null;
    if (hero.id === eventoId) {
      return { estado: TipoEstadoEvento.PUBLICADO, fechaInicioOffsetDays: params.diasAlEvento };
    }
    const secondary = ctx.eventos.find((e) => e.id !== hero.id);
    if (secondary?.id === eventoId) {
      return { estado: TipoEstadoEvento.BORRADOR, fechaInicioOffsetDays: params.diasAlEvento + 21 };
    }
    return null;
  }
}

export const goodPaceScenario = new GoodPaceScenario();
