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

/** Comisión de servicio Eventum cobrada al cliente (boletas + productos visibles). */
export function getServicioEventumTotal(stats: DashboardStats, mostrarProductos: boolean): number {
  const boletas = Number(stats.valor_servicio_total || 0);
  const productos = mostrarProductos ? Number(stats.valor_servicio_productos_total || 0) : 0;
  return boletas + productos;
}

/** Comisión Wompi estimada sobre la parte del organizador (ventas/boletas + productos). */
export function getComisionWompiOrganizador(stats: DashboardStats, mostrarProductos: boolean): number {
  const boletas = Number(stats.wompi_ventas_total || 0);
  const productos = mostrarProductos ? Number(stats.wompi_productos_ventas_total || 0) : 0;
  return boletas + productos;
}

/** @deprecated Usar getSaldoEstimadoRecibirConsolidado */
export const getValorEstimadoRecibirConsolidado = getSaldoEstimadoRecibirConsolidado;

export interface DashboardFinanzasOrganizadorView {
  recaudoBruto: number;
  recaudoBrutoBoletas: number;
  recaudoBrutoProductos: number;
  /** Servicio Eventum + comisión Wompi (parte organizador). */
  descuentosEstimados: number;
  servicioEventum: number;
  comisionWompi: number;
  servicioPct: number;
  wompiPct: number;
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

  const descuentosEstimados = recaudoBruto - saldoEstimadoRecibir;
  let servicioEventum = getServicioEventumTotal(stats, mostrarProductos);
  let comisionWompi = getComisionWompiOrganizador(stats, mostrarProductos);

  if (servicioEventum + comisionWompi <= 0 && descuentosEstimados > 0) {
    servicioEventum = descuentosEstimados;
    comisionWompi = 0;
  } else {
    const drift = descuentosEstimados - servicioEventum - comisionWompi;
    if (Math.abs(drift) >= 1) {
      comisionWompi = Math.max(0, descuentosEstimados - servicioEventum);
    }
  }

  return {
    recaudoBruto,
    recaudoBrutoBoletas,
    recaudoBrutoProductos,
    descuentosEstimados,
    servicioEventum,
    comisionWompi,
    servicioPct: recaudoBruto > 0 ? Math.round((servicioEventum / recaudoBruto) * 100) : 0,
    wompiPct: recaudoBruto > 0 ? Math.round((comisionWompi / recaudoBruto) * 100) : 0,
    saldoEstimadoRecibir,
    saldoEstimadoRecibirBoletas,
    saldoEstimadoRecibirProductos,
  };
}
