import { DemoBuildContext, DemoScenarioParams } from './demo-scenario.types';
import {
  resolveAforoTotal,
  resolveBoletasVendidas,
  estimateIngresosBoletas,
  estimateIngresosProductos,
  clientesFromBoletas,
  pickHeroEvento,
} from './demo-stats.builder';

/** Métricas derivadas de params + contexto para un evento concreto. */
export interface DemoEventMetrics {
  aforoTotal: number;
  boletasVendidas: number;
  boletasUsadas: number;
  productosVendidos: number;
  cuponesUsados: number;
  clientes: number;
  recaudoBoletas: number;
  recaudoProductos: number;
  precioPromedioBoleta: number;
}

export function resolveEventMetrics(
  ctx: DemoBuildContext,
  params: DemoScenarioParams,
  eventoId: number,
  overrides?: Partial<DemoEventMetrics>,
): DemoEventMetrics {
  const hero = pickHeroEvento(ctx);
  const isHero = hero?.id === eventoId;
  const scale = isHero ? 1 : 0.35;

  const aforoTotal = params.aforoTotal;
  const pct = isHero ? params.aforoPctVendido : Math.max(0, Math.round(params.aforoPctVendido * scale));
  const boletasVendidas = resolveBoletasVendidas(aforoTotal, pct);
  const boletasUsadas = Math.round(boletasVendidas * (params.asistenciaPct / 100));
  const productosVendidos = isHero
    ? params.productosVendidos
    : Math.max(0, Math.round(params.productosVendidos * scale));
  const cuponesUsados = isHero ? params.cuponesUsados : Math.max(0, Math.round(params.cuponesUsados * scale));
  const precioPromedioBoleta = isHero ? 92_000 : 78_000;
  const recaudoBoletas = estimateIngresosBoletas(boletasVendidas, precioPromedioBoleta);
  const recaudoProductos = estimateIngresosProductos(productosVendidos);
  const clientes = clientesFromBoletas(boletasVendidas);

  return {
    aforoTotal,
    boletasVendidas,
    boletasUsadas,
    productosVendidos,
    cuponesUsados,
    clientes,
    recaudoBoletas,
    recaudoProductos,
    precioPromedioBoleta,
    ...overrides,
  };
}

export function resolveAforoFromTipos(
  tipos: { cantidad_total?: number }[] | undefined,
  params: DemoScenarioParams,
): number {
  return resolveAforoTotal(tipos as any, params.aforoTotal);
}
