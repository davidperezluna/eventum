import { DemoBaseScenario } from '../demo-base.scenario';
import { DemoBuildContext, DemoScenarioMeta, DemoScenarioParams } from '../demo-scenario.types';
import { DemoEventMetrics } from '../demo-scenario.metrics';
import { TipoEstadoEvento } from '../../types';
import { DemoEventoPresentationHints } from '../demo-scenario.types';
import { pickHeroEvento } from '../demo-stats.builder';

/** Evento finalizado: cierre con alta asistencia y ventas completas. */
export class FinishedScenario extends DemoBaseScenario {
  readonly meta: DemoScenarioMeta = {
    id: 'finished',
    title: 'Finalizado',
    description: 'Evento cerrado con ~91% vendido y ~89% de asistencia. Narrativa de cierre exitoso.',
  };

  readonly defaultParams: DemoScenarioParams = {
    aforoPctVendido: 91,
    diasAlEvento: -3,
    asistenciaPct: 89,
    productosVendidos: 165,
    cuponesUsados: 22,
    eventosEnCartera: 2,
    aforoTotal: 300,
  };

  protected override resolveHeroMetrics(_ctx: DemoBuildContext, params: DemoScenarioParams): DemoEventMetrics {
    const boletasVendidas = Math.round(params.aforoTotal * (params.aforoPctVendido / 100));
    const boletasUsadas = Math.round(boletasVendidas * (params.asistenciaPct / 100));
    return {
      aforoTotal: params.aforoTotal,
      boletasVendidas,
      boletasUsadas,
      productosVendidos: params.productosVendidos,
      cuponesUsados: params.cuponesUsados,
      clientes: Math.round(boletasVendidas * 0.76),
      recaudoBoletas: Math.round(boletasVendidas * 95_000),
      recaudoProductos: Math.round(params.productosVendidos * 27_000),
      precioPromedioBoleta: 95_000,
    };
  }

  protected override feedCount(): number {
    return 4;
  }

  protected override ventas7dPeakToday(): boolean {
    return false;
  }

  override getEventoPresentationHints(
    ctx: DemoBuildContext,
    params: DemoScenarioParams,
    eventoId: number,
  ): DemoEventoPresentationHints | null {
    const hero = pickHeroEvento(ctx);
    if (hero?.id !== eventoId) return null;
    return { estado: TipoEstadoEvento.FINALIZADO, fechaInicioOffsetDays: params.diasAlEvento };
  }
}

export const finishedScenario = new FinishedScenario();
