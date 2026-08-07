import { DemoBaseScenario } from '../demo-base.scenario';
import { DemoBuildContext, DemoScenarioMeta, DemoScenarioParams } from '../demo-scenario.types';
import { DemoEventMetrics } from '../demo-scenario.metrics';
import { TipoEstadoEvento } from '../../types';
import { DemoEventoPresentationHints } from '../demo-scenario.types';
import { pickHeroEvento } from '../demo-stats.builder';

/** Evento recién creado: sin ventas, configuración parcial. */
export class NewlyCreatedScenario extends DemoBaseScenario {
  readonly meta: DemoScenarioMeta = {
    id: 'newly-created',
    title: 'Recién creado',
    description: 'Evento en borrador sin ventas. Muestra empty states y checklist de operaciones.',
  };

  readonly defaultParams: DemoScenarioParams = {
    aforoPctVendido: 0,
    diasAlEvento: 30,
    asistenciaPct: 0,
    productosVendidos: 0,
    cuponesUsados: 0,
    eventosEnCartera: 1,
    aforoTotal: 300,
  };

  protected override resolveHeroMetrics(_ctx: DemoBuildContext, params: DemoScenarioParams): DemoEventMetrics {
    return {
      aforoTotal: params.aforoTotal,
      boletasVendidas: 0,
      boletasUsadas: 0,
      productosVendidos: 0,
      cuponesUsados: 0,
      clientes: 0,
      recaudoBoletas: 0,
      recaudoProductos: 0,
      precioPromedioBoleta: 85_000,
    };
  }

  protected override feedCount(): number {
    return 0;
  }

  protected override organizerEventosActivos(): number {
    return 0;
  }

  override getEventoPresentationHints(
    ctx: DemoBuildContext,
    params: DemoScenarioParams,
    eventoId: number,
  ): DemoEventoPresentationHints | null {
    const hero = pickHeroEvento(ctx);
    if (hero?.id !== eventoId) return null;
    return { estado: TipoEstadoEvento.BORRADOR, fechaInicioOffsetDays: params.diasAlEvento };
  }
}

export const newlyCreatedScenario = new NewlyCreatedScenario();
