import { CuponDescuento, DashboardStats, Producto, TipoBoleta } from '../types';
import { ReporteEvento, ReporteVentas } from '../services/reportes.service';
import {
  DemoBuildContext,
  DemoScenarioMeta,
  DemoScenarioParams,
  DemoEventoPresentationHints,
} from './demo-scenario.types';

/**
 * Contrato de un escenario de demostración.
 * Cada escenario es independiente; agregar uno nuevo = nueva clase + registro.
 */
export interface DemoScenarioDefinition {
  readonly meta: DemoScenarioMeta;
  readonly defaultParams: DemoScenarioParams;

  buildOrganizerDashboard(ctx: DemoBuildContext, params: DemoScenarioParams): DashboardStats;

  buildEventDashboardStats(
    ctx: DemoBuildContext,
    params: DemoScenarioParams,
    eventoId: number,
  ): DashboardStats;

  buildReporteEvento(
    ctx: DemoBuildContext,
    params: DemoScenarioParams,
    eventoId: number,
  ): ReporteEvento;

  buildVentasPorDia(
    ctx: DemoBuildContext,
    params: DemoScenarioParams,
    eventoId: number,
  ): ReporteVentas[];

  applyTiposBoleta(
    tipos: TipoBoleta[],
    ctx: DemoBuildContext,
    params: DemoScenarioParams,
    eventoId: number,
  ): TipoBoleta[];

  applyProductos(
    productos: Producto[],
    ctx: DemoBuildContext,
    params: DemoScenarioParams,
    eventoId: number,
  ): Producto[];

  applyCupones(
    cupones: CuponDescuento[],
    ctx: DemoBuildContext,
    params: DemoScenarioParams,
    eventoId: number,
  ): CuponDescuento[];

  getEventoPresentationHints(
    ctx: DemoBuildContext,
    params: DemoScenarioParams,
    eventoId: number,
  ): DemoEventoPresentationHints | null;
}
