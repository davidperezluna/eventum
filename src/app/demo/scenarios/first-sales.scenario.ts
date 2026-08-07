import { DemoBaseScenario } from '../demo-base.scenario';
import { DemoBuildContext, DemoScenarioMeta, DemoScenarioParams } from '../demo-scenario.types';
import { DemoEventMetrics } from '../demo-scenario.metrics';
import { TipoEstadoEvento } from '../../types';
import { DemoEventoPresentationHints } from '../demo-scenario.types';
import { pickHeroEvento } from '../demo-stats.builder';

/** Primeras ventas: momentum inicial, pocos clientes. */
export class FirstSalesScenario extends DemoBaseScenario {
  readonly meta: DemoScenarioMeta = {
    id: 'first-sales',
    title: 'Primeras ventas',
    description: 'Algunas compras recientes (~8% aforo). Ideal para mostrar el arranque comercial.',
  };

  readonly defaultParams: DemoScenarioParams = {
    aforoPctVendido: 8,
    diasAlEvento: 18,
    asistenciaPct: 0,
    productosVendidos: 6,
    cuponesUsados: 2,
    eventosEnCartera: 1,
    aforoTotal: 300,
  };

  protected override resolveHeroMetrics(_ctx: DemoBuildContext, params: DemoScenarioParams): DemoEventMetrics {
    const boletasVendidas = Math.max(4, Math.round(params.aforoTotal * 0.08));
    return {
      aforoTotal: params.aforoTotal,
      boletasVendidas,
      boletasUsadas: 0,
      productosVendidos: params.productosVendidos,
      cuponesUsados: params.cuponesUsados,
      clientes: Math.max(3, Math.round(boletasVendidas * 0.85)),
      recaudoBoletas: Math.round(boletasVendidas * 88_000),
      recaudoProductos: Math.round(params.productosVendidos * 22_000),
      precioPromedioBoleta: 88_000,
    };
  }

  protected override feedCount(): number {
    return 3;
  }

  protected override ventas7dPeakToday(): boolean {
    return true;
  }

  override getEventoPresentationHints(
    ctx: DemoBuildContext,
    params: DemoScenarioParams,
    eventoId: number,
  ): DemoEventoPresentationHints | null {
    const hero = pickHeroEvento(ctx);
    if (hero?.id !== eventoId) return null;
    return { estado: TipoEstadoEvento.PUBLICADO, fechaInicioOffsetDays: params.diasAlEvento };
  }
}

export const firstSalesScenario = new FirstSalesScenario();
