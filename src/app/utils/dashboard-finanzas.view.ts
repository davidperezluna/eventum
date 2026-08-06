import { DashboardStats } from '../types';

/**
 * Mapeo de presentación para el dashboard del organizador.
 * No recalcula finanzas: compone campos existentes de DashboardStats (DashboardService).
 */

/** Recaudo bruto = lo que pagaron los clientes (Σ compras.total + Σ compras_productos.total). No es dinero del empresario. */
export function getRecaudoBrutoBoletas(stats: DashboardStats): number {
  return Number(stats.ingresos_totales || 0);
}

export function getRecaudoBrutoProductos(stats: DashboardStats, mostrarProductos: boolean): number {
  return mostrarProductos ? Number(stats.ingresos_productos_totales || 0) : 0;
}

export function getRecaudoBrutoConsolidado(stats: DashboardStats, mostrarProductos: boolean): number {
  return getRecaudoBrutoBoletas(stats) + getRecaudoBrutoProductos(stats, mostrarProductos);
}

/** Igual criterio que dashboard-kpis / organizador: `stats.tiene_productos`. */
export function resolveMostrarProductos(stats: DashboardStats | null | undefined): boolean {
  return !!stats?.tiene_productos;
}

/** Número exacto sin símbolo (ej. 10.800) — hero KPI admin/organizador. */
export function formatFinanzasMontoExacto(value: number | null | undefined): string {
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

/** Moneda COP exacta, sin abreviación K/M (ej. $ 10.800). */
export function formatFinanzasMonedaExacta(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) {
    return '$0';
  }
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export function getPctRecaudoProductos(stats: DashboardStats | null, mostrarProductos: boolean): number {
  if (!stats) return 0;
  const recaudo = getRecaudoBrutoConsolidado(stats, mostrarProductos);
  if (recaudo <= 0) return 0;
  return Math.round((getRecaudoBrutoProductos(stats, mostrarProductos) / recaudo) * 100);
}

/**
 * Saldo estimado a recibir = neto empresario post-Wompi
 * (neto_ventas_post_wompi_total + neto_productos_ventas_post_wompi_total).
 */
export function getSaldoEstimadoRecibirBoletas(stats: DashboardStats): number {
  return Number(stats.neto_ventas_post_wompi_total || 0);
}

export function getSaldoEstimadoRecibirProductos(stats: DashboardStats, mostrarProductos: boolean): number {
  return mostrarProductos ? Number(stats.neto_productos_ventas_post_wompi_total || 0) : 0;
}

export function getSaldoEstimadoRecibirConsolidado(stats: DashboardStats, mostrarProductos: boolean): number {
  return getSaldoEstimadoRecibirBoletas(stats) + getSaldoEstimadoRecibirProductos(stats, mostrarProductos);
}

/** @deprecated Usar getSaldoEstimadoRecibirConsolidado */
export const getValorEstimadoRecibirConsolidado = getSaldoEstimadoRecibirConsolidado;

export interface DashboardFinanzasOrganizadorView {
  recaudoBruto: number;
  recaudoBrutoBoletas: number;
  recaudoBrutoProductos: number;
  descuentosEstimados: number;
  saldoEstimadoRecibir: number;
  saldoEstimadoRecibirBoletas: number;
  saldoEstimadoRecibirProductos: number;
}

export function buildFinanzasOrganizadorView(
  stats: DashboardStats,
  mostrarProductos: boolean
): DashboardFinanzasOrganizadorView {
  const recaudoBrutoBoletas = getRecaudoBrutoBoletas(stats);
  const recaudoBrutoProductos = getRecaudoBrutoProductos(stats, mostrarProductos);
  const recaudoBruto = recaudoBrutoBoletas + recaudoBrutoProductos;

  const saldoEstimadoRecibirBoletas = getSaldoEstimadoRecibirBoletas(stats);
  const saldoEstimadoRecibirProductos = getSaldoEstimadoRecibirProductos(stats, mostrarProductos);
  const saldoEstimadoRecibir = saldoEstimadoRecibirBoletas + saldoEstimadoRecibirProductos;

  return {
    recaudoBruto,
    recaudoBrutoBoletas,
    recaudoBrutoProductos,
    descuentosEstimados: recaudoBruto - saldoEstimadoRecibir,
    saldoEstimadoRecibir,
    saldoEstimadoRecibirBoletas,
    saldoEstimadoRecibirProductos,
  };
}
