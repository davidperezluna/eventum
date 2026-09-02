import { Evento, DashboardStats, TipoEstadoEvento } from '../../types';
import { ReporteEvento, ReporteVentas } from '../../services/reportes.service';
import {
  IntelActionNow,
  IntelAforoTotals,
  IntelFinanzasHeroView,
  IntelHeroMoment,
  IntelHoySection,
  IntelPulseCard,
  IntelRankingSection,
  IntelVentasSection,
} from '../evento-inteligencia/evento-inteligencia.types';
import {
  buildBoletasRankingSection,
  buildHeroMoment,
  buildHoySection,
  buildIntelFinanzasHero,
  buildPulseCards,
  buildVentasSection,
} from '../evento-inteligencia/evento-inteligencia.utils';
import {
  buildActivityFeed,
  buildAgendaCards,
  buildHeroView,
  DashOrgActivityItem,
  DashOrgAttentionItem,
  DashOrgAgendaCard,
  DashOrgHeroView,
  filterAttentionForHero,
  formatAgendaDate,
  getVariacionPorcentual,
} from './dashboard-organizador.view';

function ventas7dFromStats(stats: DashboardStats): ReporteVentas[] {
  const series = stats.ventas_por_dia ?? [];
  if (series.length === 0) return [];
  return series.map((row) => ({
    fecha: String(row.fecha).slice(0, 10),
    ventas: Number(row.ventas ?? 0),
    ingresos: Number(row.ingresos ?? 0),
    boletas_vendidas: Number(row.ventas ?? 0),
  }));
}

export interface OrgIntelActivitySection {
  question: string;
  items: DashOrgActivityItem[];
  emptyMessage: string;
}

export interface DashboardOrgIntelView {
  heroIdentity: DashOrgHeroView & { eyebrow: string; activosLabel: string };
  heroMoment: IntelHeroMoment;
  finanzasHero: IntelFinanzasHeroView;
  pulseCards: IntelPulseCard[];
  actionNow: IntelActionNow | null;
  actionNowRoute: string | any[] | null;
  ventasSection: IntelVentasSection;
  hoySection: IntelHoySection;
  eventosSection: IntelRankingSection;
  eventoIdsByRow: number[];
  proximosCards: DashOrgAgendaCard[];
  activitySection: OrgIntelActivitySection;
}

export interface BuildDashboardOrgIntelInput {
  stats: DashboardStats;
  saludo: string;
  usuarioNombre: string;
  daysUntil: (fecha: string | Date | null | undefined) => number | null;
  formatCurrency: (n: number) => string;
  formatAmount: (v: number | null | undefined) => string;
  attentionItems: DashOrgAttentionItem[];
}

export function buildOrgAforoTotals(stats: DashboardStats): IntelAforoTotals {
  const vendidas = stats.boletas_vendidas ?? 0;
  const total = Math.max(0, Number(stats.aforo_total ?? 0));
  const pct = total > 0 ? Math.min(100, Math.round((vendidas / total) * 100)) : 0;
  return { vendidas, total, pct };
}

function buildOrgSyntheticReporte(stats: DashboardStats): ReporteEvento {
  const usadas = stats.boletas_por_estado?.find((b) => b.estado === 'usada')?.cantidad ?? 0;
  const proximo = stats.eventos_proximos?.[0];
  return {
    evento_id: proximo?.id != null ? Number(proximo.id) : 0,
    evento_titulo: String(proximo?.titulo ?? 'Portafolio'),
    ingresos: stats.ingresos_totales ?? 0,
    boletas_vendidas: stats.boletas_vendidas ?? 0,
    boletas_usadas: usadas,
    clientes_unicos: stats.clientes ?? 0,
    fecha_inicio: String(proximo?.fecha_inicio ?? ''),
    fecha_fin: '',
  };
}

function proximoAsEvento(stats: DashboardStats): Evento | null {
  const proximo = stats.eventos_proximos?.[0];
  if (!proximo) return null;
  return {
    id: Number(proximo.id),
    titulo: String(proximo.titulo ?? 'Próximo evento'),
    fecha_inicio: proximo.fecha_inicio,
    estado: (proximo.estado as TipoEstadoEvento) ?? TipoEstadoEvento.PUBLICADO,
  } as Evento;
}

function buildOrgHeroMoment(stats: DashboardStats, aforo: IntelAforoTotals, now = new Date()): IntelHeroMoment {
  const proximoEvento = proximoAsEvento(stats);
  if (proximoEvento) {
    return buildHeroMoment(proximoEvento, aforo, now);
  }

  const activos = stats.eventos_activos ?? 0;
  const disponibles = Math.max(0, aforo.total - aforo.vendidas);
  let headline: string;
  let aforoLine: string;
  let salesPhrase: string;

  if (activos === 0) {
    headline = 'Tu portafolio está listo para el primer evento';
    aforoLine = 'Sin eventos activos';
    salesPhrase = 'Crea un evento para empezar a medir';
  } else if (aforo.vendidas === 0) {
    headline = `${activos} evento${activos === 1 ? '' : 's'} en preparación`;
    aforoLine = `${activos} evento${activos === 1 ? '' : 's'} activo${activos === 1 ? '' : 's'}`;
    salesPhrase = 'Todavía no hay ventas en el portafolio';
  } else {
    headline = `${activos} evento${activos === 1 ? '' : 's'} generando movimiento`;
    aforoLine = `${aforo.pct}% del aforo estimado vendido`;
    salesPhrase = `${aforo.vendidas.toLocaleString('es-CO')} entradas en todo tu negocio`;
  }

  return {
    headline,
    aforoLine,
    availabilityLine:
      disponibles > 0
        ? `${disponibles.toLocaleString('es-CO')} entradas disponibles en el portafolio`
        : 'Sin entradas disponibles',
    disponibles,
    salesPhrase,
    salesDetail: 'Haz zoom en un evento para ver el detalle',
    aforoPct: aforo.pct,
    countdown: null,
    countdownCaption: 'Vista general',
    showCountdown: false,
  };
}

function buildEventosRankingSection(
  stats: DashboardStats,
  aforo: IntelAforoTotals,
  formatCurrency: (n: number) => string,
): { section: IntelRankingSection; eventIds: number[] } {
  const top = stats.top_eventos ?? [];

  type TopEventoFin = {
    id?: number;
    titulo?: string;
    boletas_vendidas?: number;
    recibiras_aprox?: number;
  };

  const ranking = top.map((e) => {
    const row = e as TopEventoFin;
    return {
      nombre: String(row.titulo || 'Evento'),
      vendidas: Number(row.boletas_vendidas ?? 0),
      total: aforo.total,
      pct: 0,
      ingresosEst: Math.max(0, Number(row.recibiras_aprox ?? 0)),
    };
  });

  ranking.sort((a, b) => b.ingresosEst - a.ingresosEst || b.vendidas - a.vendidas);

  const section = buildBoletasRankingSection(ranking, aforo, formatCurrency);
  section.question = '¿Qué eventos van mejor?';

  if (top.length === 0) {
    section.empty = true;
    section.emptyMessage = 'Crea tu primer evento para empezar a comparar rendimiento.';
    section.conclusion = 'Cuando tengas eventos activos, este ranking te mostrará dónde hacer zoom.';
    section.rows = [];
  } else if (section.empty && ranking.length > 0) {
    section.emptyMessage = `Tienes ${top.length} evento${top.length === 1 ? '' : 's'} en cartelera, sin ventas registradas todavía.`;
    section.conclusion = 'Cuando lleguen las primeras compras, sabrás cuál evento convence primero.';
  } else if (!section.empty) {
    section.totalLabel = 'Recibirás aprox.';
    if (section.conclusion) {
      section.conclusion = section.conclusion
        .replace(/boletas/gi, 'eventos')
        .replace(/tipo(s)?/gi, 'evento$1')
        .replace(/entradas vendidas/gi, 'ventas del portafolio')
        .replace(/lo que pagaron tus clientes/gi, 'lo que recibirás aprox.')
        .replace(/lo recaudado/gi, 'lo que recibirás aprox.');
    }
    section.ctaLabel = 'Ver todos los eventos';
  }

  const eventIds = top
    .filter((e) => Number((e as { boletas_vendidas?: number }).boletas_vendidas ?? 0) > 0)
    .map((e) => Number(e.id));
  return { section, eventIds };
}

function buildOrgActionNow(item: DashOrgAttentionItem | null): IntelActionNow | null {
  if (!item) return null;
  const variant =
    item.tone === 'warn' ? 'warning' : item.tone === 'ok' ? 'success' : item.tone === 'info' ? 'info' : 'neutral';
  return {
    variant,
    message: item.title === item.message ? item.message : `${item.title}. ${item.message}`,
    ctaLabel: item.actionLabel,
    ctaAction: 'operaciones',
  };
}

function buildOrgActivitySection(activity: DashOrgActivityItem[]): OrgIntelActivitySection {
  const items = activity.slice(0, 10);

  return {
    question: '¿Qué acaba de pasar?',
    items,
    emptyMessage: 'Aún no hay ventas recientes en tu portafolio.',
  };
}

export function buildDashboardOrgIntelView(input: BuildDashboardOrgIntelInput): DashboardOrgIntelView {
  const { stats, saludo, usuarioNombre, daysUntil, formatCurrency, formatAmount, attentionItems } = input;

  const variacionDia = getVariacionPorcentual(
    stats.ingresos_dia_actual || 0,
    stats.ingresos_dia_anterior || 0,
  );
  const variacionMes = getVariacionPorcentual(
    stats.ingresos_mes_actual || 0,
    stats.ingresos_mes_anterior || 0,
  );

  const finanzasHero = buildIntelFinanzasHero(stats, formatCurrency, formatAmount);
  const saldoAmount =
    !finanzasHero.empty && finanzasHero.recibirasAproxMoneda !== formatCurrency(0)
      ? finanzasHero.recibirasAproxMoneda
      : null;

  const heroIdentity = {
    ...buildHeroView({
      stats,
      saludo,
      usuarioNombre,
      daysUntil,
      formatAmount,
      variacionDia,
      variacionMes,
      saldoAmount,
    }),
    eyebrow: 'Centro de inteligencia · Vista general',
    activosLabel: `${formatAmount(stats.eventos_activos)} activo${stats.eventos_activos === 1 ? '' : 's'}`,
  };

  const aforo = buildOrgAforoTotals(stats);
  const reporte = buildOrgSyntheticReporte(stats);
  const heroMoment = buildOrgHeroMoment(stats, aforo);
  const pulseCards = buildPulseCards(reporte, stats, aforo);
  const ventasSection = buildVentasSection(stats, formatCurrency);
  ventasSection.question = '¿Qué generaron tus eventos?';

  const ventas7d = ventas7dFromStats(stats);
  const hoySection = buildHoySection(stats, ventas7d, !!stats.tiene_productos, formatCurrency);

  const { section: eventosSection, eventIds: eventoIdsByRow } = buildEventosRankingSection(
    stats,
    aforo,
    formatCurrency,
  );

  const filteredAttention = filterAttentionForHero(attentionItems, heroIdentity);
  const actionItem = filteredAttention[0] ?? null;
  const actionNow = buildOrgActionNow(actionItem);
  const actionNowRoute = actionItem?.actionRoute ?? null;

  const activity = buildActivityFeed(stats);
  const activitySection = buildOrgActivitySection(activity);

  const proximosCards = buildAgendaCards(
    stats,
    formatAmount,
    formatCurrency,
    daysUntil,
    formatAgendaDate,
  );

  return {
    heroIdentity,
    heroMoment,
    finanzasHero,
    pulseCards,
    actionNow,
    actionNowRoute,
    ventasSection,
    hoySection,
    eventosSection,
    eventoIdsByRow,
    proximosCards,
    activitySection,
  };
}
