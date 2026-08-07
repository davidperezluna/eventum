import { DemoBaseScenario } from '../demo-base.scenario';
import { DemoBuildContext, DemoScenarioMeta, DemoScenarioParams } from '../demo-scenario.types';
import { DemoEventMetrics } from '../demo-scenario.metrics';
import { TipoEstadoEvento } from '../../types';
import { DemoEventoPresentationHints } from '../demo-scenario.types';
import { pickHeroEvento } from '../demo-stats.builder';

/** Día del evento: alto aforo vendido, escaneos activos, en curso. */
export class EventDayScenario extends DemoBaseScenario {
  readonly meta: DemoScenarioMeta = {
    id: 'event-day',
    title: 'Día del evento',
    description: 'Evento en curso con ~82% vendido y ~48% de asistentes ya ingresados.',
  };

  readonly defaultParams: DemoScenarioParams = {
    aforoPctVendido: 82,
    diasAlEvento: 0,
    asistenciaPct: 48,
    productosVendidos: 120,
    cuponesUsados: 18,
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
      clientes: Math.round(boletasVendidas * 0.74),
      recaudoBoletas: Math.round(boletasVendidas * 94_000),
      recaudoProductos: Math.round(params.productosVendidos * 26_000),
      precioPromedioBoleta: 94_000,
    };
  }

  protected override feedCount(): number {
    return 5;
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
    return { estado: TipoEstadoEvento.EN_CURSO, fechaInicioOffsetDays: 0 };
  }
}

export const eventDayScenario = new EventDayScenario();
