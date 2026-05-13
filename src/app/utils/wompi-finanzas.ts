/**
 * Estimación de comisión Wompi (misma fórmula que el reporte de ventas completadas):
 * (total × tarifa + fijo) × (1 + IVA), no reemplaza el extracto oficial de Wompi.
 */

export const WOMPI_COMISION_TARIFA = 0.0267;
export const WOMPI_COMISION_FIJO_COP = 700;
export const WOMPI_IVA = 0.19;

export function calcularWompiDescuento(total: number): number {
  const bruto = Number(total || 0);
  const comisionBase = bruto * WOMPI_COMISION_TARIFA + WOMPI_COMISION_FIJO_COP;
  return comisionBase * (1 + WOMPI_IVA);
}

export interface RepartoWompiCompra {
  wompi_total: number;
  /** Parte de W proporcional a ventas/boletas (BV), redondeada a entero COP. */
  wompi_ventas: number;
  /** Resto para que W_ventas + W_servicio = W total por fila. */
  wompi_servicio: number;
  neto_ventas_post_wompi: number;
  neto_servicio_post_wompi: number;
  /** T − W (equivale a neto_ventas + neto_servicio cuando BV + VS = T). */
  neto_total_post_wompi: number;
  /** max(0, T − VS) — subtotal ventas sin servicio. */
  ingresos_ventas_bruto: number;
}

export function repartoWompiPorCompra(total: number, valorServicio: number): RepartoWompiCompra {
  const T = Number(total || 0);
  const VS = Number(valorServicio || 0);
  const BV = Math.max(0, T - VS);

  if (T <= 0) {
    return {
      wompi_total: 0,
      wompi_ventas: 0,
      wompi_servicio: 0,
      neto_ventas_post_wompi: 0,
      neto_servicio_post_wompi: 0,
      neto_total_post_wompi: 0,
      ingresos_ventas_bruto: BV,
    };
  }

  const W = calcularWompiDescuento(T);
  const wompi_ventas = Math.round(W * (BV / T));
  const wompi_servicio = W - wompi_ventas;
  const neto_ventas_post_wompi = BV - wompi_ventas;
  const neto_servicio_post_wompi = VS - wompi_servicio;

  return {
    wompi_total: W,
    wompi_ventas,
    wompi_servicio,
    neto_ventas_post_wompi,
    neto_servicio_post_wompi,
    neto_total_post_wompi: T - W,
    ingresos_ventas_bruto: BV,
  };
}

export interface AgregadosFinanzasCompras {
  ingresos: number;
  valorServicioTotal: number;
  porcentajeServicioPromedio: number;
  wompi_total_estimado: number;
  wompi_ventas_total: number;
  wompi_servicio_total: number;
  neto_ventas_post_wompi_total: number;
  neto_servicio_post_wompi_total: number;
  ingresos_ventas_bruto_total: number;
}

export function agregarFinanzasDesdeComprasCompletadas(
  filas: Array<{ total?: unknown; valor_servicio?: unknown; porcentaje_servicio?: unknown }>
): AgregadosFinanzasCompras {
  let ingresos = 0;
  let valorServicioTotal = 0;
  let porcentajeServicioSum = 0;
  let wompi_total_estimado = 0;
  let wompi_ventas_total = 0;
  let wompi_servicio_total = 0;
  let neto_ventas_post_wompi_total = 0;
  let neto_servicio_post_wompi_total = 0;
  let ingresos_ventas_bruto_total = 0;

  for (const c of filas) {
    const total = Number(c.total || 0);
    const vs = Number(c.valor_servicio || 0);
    const ps = Number(c.porcentaje_servicio || 0);
    ingresos += total;
    valorServicioTotal += vs;
    porcentajeServicioSum += ps;

    const r = repartoWompiPorCompra(total, vs);
    wompi_total_estimado += r.wompi_total;
    wompi_ventas_total += r.wompi_ventas;
    wompi_servicio_total += r.wompi_servicio;
    neto_ventas_post_wompi_total += r.neto_ventas_post_wompi;
    neto_servicio_post_wompi_total += r.neto_servicio_post_wompi;
    ingresos_ventas_bruto_total += r.ingresos_ventas_bruto;
  }

  const n = filas.length;
  return {
    ingresos,
    valorServicioTotal,
    porcentajeServicioPromedio: n > 0 ? porcentajeServicioSum / n : 0,
    wompi_total_estimado,
    wompi_ventas_total,
    wompi_servicio_total,
    neto_ventas_post_wompi_total,
    neto_servicio_post_wompi_total,
    ingresos_ventas_bruto_total,
  };
}
