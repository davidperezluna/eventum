import { DashboardStats, Evento, TipoBoleta, TipoEstadoEvento } from '../types';
import { ReporteEvento, ReporteVentas } from '../services/reportes.service';
import { DemoBuildContext } from './demo-scenario.types';

const SERVICIO_PCT = 0.1;
const WOMPI_PCT = 0.0265;

export function resolveAforoTotal(tipos: TipoBoleta[], fallback: number): number {
  const fromTipos = tipos.reduce((s, t) => s + Number(t.cantidad_total ?? 0), 0);
  return fromTipos > 0 ? fromTipos : fallback;
}

export function resolveBoletasVendidas(aforoTotal: number, pct: number): number {
  return Math.max(0, Math.round(aforoTotal * (Math.min(100, Math.max(0, pct)) / 100)));
}

export function estimateIngresosBoletas(boletas: number, precioPromedio = 92000): number {
  return Math.round(boletas * precioPromedio);
}

export function estimateIngresosProductos(unidades: number, precioPromedio = 28000): number {
  return Math.round(unidades * precioPromedio);
}

function finanzasFromRecaudo(recaudoBoletas: number, recaudoProductos: number): Pick<
  DashboardStats,
  | 'ingresos_totales'
  | 'ingresos_productos_totales'
  | 'valor_servicio_total'
  | 'valor_servicio_productos_total'
  | 'wompi_ventas_total'
  | 'wompi_productos_ventas_total'
  | 'neto_ventas_post_wompi_total'
  | 'neto_productos_ventas_post_wompi_total'
  | 'porcentaje_servicio_promedio'
> {
  const valorServicioBoletas = Math.round(recaudoBoletas * SERVICIO_PCT);
  const valorServicioProductos = Math.round(recaudoProductos * SERVICIO_PCT);
  const wompiBoletas = Math.round(recaudoBoletas * WOMPI_PCT);
  const wompiProductos = Math.round(recaudoProductos * WOMPI_PCT);
  const netoBoletas = Math.max(0, recaudoBoletas - valorServicioBoletas - wompiBoletas);
  const netoProductos = Math.max(0, recaudoProductos - valorServicioProductos - wompiProductos);

  return {
    ingresos_totales: recaudoBoletas,
    ingresos_productos_totales: recaudoProductos,
    valor_servicio_total: valorServicioBoletas,
    valor_servicio_productos_total: valorServicioProductos,
    wompi_ventas_total: wompiBoletas,
    wompi_productos_ventas_total: wompiProductos,
    neto_ventas_post_wompi_total: netoBoletas,
    neto_productos_ventas_post_wompi_total: netoProductos,
    porcentaje_servicio_promedio: SERVICIO_PCT * 100,
  };
}

export function emptyDashboardStats(): DashboardStats {
  return {
    eventos_activos: 0,
    boletas_vendidas: 0,
    productos_vendidos: 0,
    pedidos_productos: 0,
    tiene_productos: false,
    ingresos_totales: 0,
    ingresos_productos_totales: 0,
    clientes: 0,
    ventas_recientes: [],
    eventos_proximos: [],
    eventos_totales: 0,
    categorias_activas: 0,
    lugares_activos: 0,
    ingresos_mes_actual: 0,
    ingresos_mes_anterior: 0,
    ingresos_dia_actual: 0,
    ingresos_dia_anterior: 0,
    porcentaje_servicio_promedio: 0,
    valor_servicio_total: 0,
    porcentaje_servicio_productos_promedio: 0,
    valor_servicio_productos_total: 0,
    ingresos_ventas_bruto_total: 0,
    ingresos_productos_bruto_total: 0,
    wompi_total_estimado: 0,
    wompi_productos_total_estimado: 0,
    wompi_ventas_total: 0,
    wompi_productos_ventas_total: 0,
    wompi_servicio_total: 0,
    wompi_productos_servicio_total: 0,
    neto_ventas_post_wompi_total: 0,
    neto_productos_ventas_post_wompi_total: 0,
    neto_servicio_post_wompi_total: 0,
    neto_productos_servicio_post_wompi_total: 0,
    neto_total_post_wompi_total: 0,
    neto_productos_total_post_wompi_total: 0,
    boletas_por_estado: [],
    top_eventos: [],
  };
}

export function buildVentasRecientesFeed(
  ctx: DemoBuildContext,
  evento: Evento | null,
  count: number,
  totalPromedio: number,
): any[] {
  if (count <= 0 || !evento) return [];
  const now = Date.now();
  const gapsMin = [8, 22, 95, 102, 280, 410];
  const totals = [1.0, 1.15, 0.92, 1.08, 0.95, 1.05];
  return Array.from({ length: Math.min(count, gapsMin.length) }, (_, i) => ({
    id: 9000 + i,
    numero_transaccion: `DEMO-${1000 + i}`,
    fecha_compra: new Date(now - gapsMin[i] * 60_000).toISOString(),
    total: Math.round(totalPromedio * totals[i]),
    estado_pago: 'completado',
    tipo_venta: i === 2 ? 'productos' : i === 4 ? 'mixta' : 'ventas',
    evento_id: evento.id,
    evento: { id: evento.id, titulo: evento.titulo },
  }));
}

export function buildVentas7dSeries(
  boletasTotales: number,
  ingresosTotales: number,
  peakToday = true,
): ReporteVentas[] {
  const weights = peakToday
    ? [0.06, 0.08, 0.1, 0.12, 0.14, 0.18, 0.32]
    : [0.12, 0.11, 0.13, 0.14, 0.15, 0.16, 0.19];
  const days: ReporteVentas[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const w = weights[6 - i];
    const boletas = Math.max(0, Math.round(boletasTotales * w));
    const ingresos = Math.max(0, Math.round(ingresosTotales * w));
    days.push({
      fecha: d.toISOString().slice(0, 10),
      ventas: Math.max(1, Math.round(boletas / 2.2)),
      ingresos,
      boletas_vendidas: boletas,
    });
  }
  return days;
}

export function distributeTiposVendidas(
  tipos: TipoBoleta[],
  totalVendidas: number,
  ratios = [0.62, 0.38],
): TipoBoleta[] {
  if (tipos.length === 0) {
    return tipos;
  }
  const active = tipos.filter((t) => t.activo !== false);
  const list = active.length > 0 ? active : tipos;
  let rest = totalVendidas;
  return tipos.map((t) => {
    const idx = list.indexOf(t);
    if (idx < 0) {
      return { ...t, cantidad_vendidas: 0 };
    }
    let vendidas: number;
    if (idx === list.length - 1) {
      vendidas = rest;
    } else {
      const ratio = ratios[idx] ?? 1 / list.length;
      vendidas = Math.round(totalVendidas * ratio);
      rest -= vendidas;
    }
    vendidas = Math.min(vendidas, Number(t.cantidad_total ?? vendidas));
    return { ...t, cantidad_vendidas: Math.max(0, vendidas) };
  });
}

export function pickHeroEvento(ctx: DemoBuildContext): Evento | null {
  if (ctx.heroEvento) return ctx.heroEvento;
  if (ctx.eventos.length === 0) return null;
  const sorted = [...ctx.eventos].sort((a, b) => {
    const fa = a.fecha_inicio ? new Date(a.fecha_inicio).getTime() : 0;
    const fb = b.fecha_inicio ? new Date(b.fecha_inicio).getTime() : 0;
    return fa - fb;
  });
  return sorted.find((e) => e.fecha_inicio && new Date(e.fecha_inicio).getTime() > Date.now()) ?? sorted[0];
}

export function buildReporteFromMetrics(
  evento: Evento,
  boletasVendidas: number,
  boletasUsadas: number,
  ingresos: number,
  clientes: number,
): ReporteEvento {
  return {
    evento_id: evento.id,
    evento_titulo: evento.titulo ?? 'Evento',
    ingresos,
    boletas_vendidas: boletasVendidas,
    boletas_usadas: boletasUsadas,
    clientes_unicos: clientes,
    fecha_inicio: String(evento.fecha_inicio ?? new Date().toISOString()),
    fecha_fin: String(evento.fecha_fin ?? evento.fecha_inicio ?? new Date().toISOString()),
  };
}

export function buildBoletasPorEstado(boletasVendidas: number, usadas: number): { estado: string; cantidad: number }[] {
  const pendientes = Math.max(0, boletasVendidas - usadas);
  if (boletasVendidas <= 0) return [];
  return [
    { estado: 'pendiente', cantidad: pendientes },
    { estado: 'usada', cantidad: usadas },
  ];
}

export function eventosProximosFromContext(ctx: DemoBuildContext, diasAlEvento: number): any[] {
  const hero = pickHeroEvento(ctx);
  const others = ctx.eventos.filter((e) => e.id !== hero?.id).slice(0, 2);
  const result: any[] = [];
  if (hero) {
    const start = new Date();
    start.setDate(start.getDate() + diasAlEvento);
    result.push({
      ...hero,
      fecha_inicio: start.toISOString(),
      estado: TipoEstadoEvento.PUBLICADO,
      activo: true,
    });
  }
  for (const e of others) {
    const start = new Date();
    start.setDate(start.getDate() + diasAlEvento + 14);
    result.push({ ...e, fecha_inicio: start.toISOString() });
  }
  return result;
}

export function topEventosFromContext(ctx: DemoBuildContext, hero: Evento | null, heroBoletas: number): any[] {
  const rows = ctx.eventos.map((e, i) => ({
    ...e,
    boletas_vendidas: e.id === hero?.id ? heroBoletas : Math.max(0, Math.round(heroBoletas * (0.45 - i * 0.12))),
  }));
  return rows
    .filter((e) => e.boletas_vendidas > 0)
    .sort((a, b) => b.boletas_vendidas - a.boletas_vendidas)
    .slice(0, 5);
}

export function mergeFinanzasIntoStats(
  base: DashboardStats,
  recaudoBoletas: number,
  recaudoProductos: number,
  extra: Partial<DashboardStats>,
): DashboardStats {
  const fin = finanzasFromRecaudo(recaudoBoletas, recaudoProductos);
  const wompiTotal = fin.wompi_ventas_total! + fin.wompi_productos_ventas_total!;
  return {
    ...base,
    ...fin,
    ...extra,
    wompi_total_estimado: wompiTotal,
    wompi_productos_total_estimado: fin.wompi_productos_ventas_total,
    neto_total_post_wompi_total: fin.neto_ventas_post_wompi_total! + fin.neto_productos_ventas_post_wompi_total!,
    neto_productos_total_post_wompi_total: fin.neto_productos_ventas_post_wompi_total,
    ingresos_ventas_bruto_total: recaudoBoletas,
    ingresos_productos_bruto_total: recaudoProductos,
  };
}

export function ingresosDiaFromSeries(ventas7d: ReporteVentas[]): { hoy: number; ayer: number } {
  const len = ventas7d.length;
  if (len === 0) return { hoy: 0, ayer: 0 };
  return {
    hoy: ventas7d[len - 1]?.ingresos ?? 0,
    ayer: len > 1 ? ventas7d[len - 2]?.ingresos ?? 0 : 0,
  };
}

export function clientesFromBoletas(boletas: number): number {
  return Math.max(1, Math.round(boletas * 0.72));
}
