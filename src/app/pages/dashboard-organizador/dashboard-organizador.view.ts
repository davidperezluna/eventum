import { DashboardStats } from '../../types';
import { DateTimeUtil } from '../../utils/date-time.util';
import {
  mapVentaToOrgSalesRow,
  type OrgSalesRowModel,
} from '../../components/org-sales-row';

export type DashOrgTone = 'warn' | 'ok' | 'info' | 'neutral';
export type DashOrgAccent = 'violet' | 'green' | 'amber' | 'blue';
export type DashOrgActivityItem = OrgSalesRowModel;

/** Clasifica el insight del hero para evitar repetirlo en Atención. */
export type DashOrgInsightKind =
  | 'draft-urgency'
  | 'day-momentum'
  | 'week-momentum'
  | 'aforo-milestone'
  | 'event-countdown'
  | 'general';

export interface DashOrgHeroView {
  greeting: string;
  insight: string;
  /** Estado cualitativo del portafolio — sin repetir KPIs numéricos. */
  stateLine: string;
  saldoLabel: string | null;
  saldoAmount: string | null;
  insightKind: DashOrgInsightKind;
  insightEventId: number | null;
}

export interface DashOrgMetricCard {
  key: string;
  question: string;
  value: string;
  hint: string;
  icon: string;
}

export interface DashOrgAttentionItem {
  key: string;
  tone: DashOrgTone;
  title: string;
  message: string;
  actionLabel: string;
  actionRoute: string | any[];
}

export interface DashOrgAgendaCard {
  id: number;
  titulo: string;
  fechaLabel: string;
  countdownLabel: string;
  boletasLabel: string;
  aforoPct: number | null;
  /** Lo que pagaron los clientes (∑ total compras). */
  clientesPagaronLabel: string | null;
  /** Recibirás aprox. (neto ventas post Wompi). */
  ingresosLabel: string | null;
  servicioLabel: string | null;
  wompiLabel: string | null;
  estadoLabel: string | null;
  isSalesLeader: boolean;
  hasFinanzas: boolean;
}

interface InsightCtx {
  stats: DashboardStats;
  saludo: string;
  usuarioNombre: string;
  daysUntil: (fecha: string | Date | null | undefined) => number | null;
  formatAmount: (v: number | null | undefined) => string;
  variacionDia: number;
  variacionMes: number;
}

interface InsightResult {
  text: string;
  kind: DashOrgInsightKind;
  eventId: number | null;
}

const AFORO_REF = 300;

export function buildHeroView(
  ctx: Omit<InsightCtx, 'saludo' | 'usuarioNombre'> & {
    saludo: string;
    usuarioNombre: string;
    saldoAmount: string | null;
  },
): DashOrgHeroView {
  const greeting = ctx.usuarioNombre ? `${ctx.saludo}, ${ctx.usuarioNombre}` : ctx.saludo;
  const picked = pickHeroInsight(ctx);
  const stateLine = buildStateLine(ctx.stats, ctx.daysUntil);

  return {
    greeting,
    insight: picked.text,
    stateLine,
    saldoLabel: ctx.saldoAmount ? 'Recibirás aproximadamente' : null,
    saldoAmount: ctx.saldoAmount,
    insightKind: picked.kind,
    insightEventId: picked.eventId,
  };
}

function pickHeroInsight(ctx: InsightCtx): InsightResult {
  const { stats, daysUntil, variacionDia, variacionMes } = ctx;
  const proximos = stats.eventos_proximos ?? [];
  const top = stats.top_eventos ?? [];

  for (const evento of proximos) {
    const estado = String(evento?.estado || '').toLowerCase();
    const titulo = String(evento?.titulo || 'Tu próximo evento');
    const id = Number(evento?.id) || null;
    const days = daysUntil(evento?.fecha_inicio);
    if (estado && estado !== 'publicado') {
      if (days === 0) {
        return { text: `${titulo} necesita publicarse hoy.`, kind: 'draft-urgency', eventId: id };
      }
      if (days != null && days <= 3) {
        return {
          text: `Publica ${titulo} antes de que falten ${days === 1 ? '24 horas' : `${days} días`}.`,
          kind: 'draft-urgency',
          eventId: id,
        };
      }
      return {
        text: `${titulo} aún está en borrador — publícalo para empezar a vender.`,
        kind: 'draft-urgency',
        eventId: id,
      };
    }
  }

  if (Math.abs(variacionDia) >= 8 && (stats.ingresos_dia_actual ?? 0) > 0) {
    if (variacionDia > 0) {
      return { text: `Hoy vendes un ${variacionDia}% más que ayer.`, kind: 'day-momentum', eventId: null };
    }
    return {
      text: `Hoy el ritmo bajó un ${Math.abs(variacionDia)}% respecto a ayer.`,
      kind: 'day-momentum',
      eventId: null,
    };
  }

  if (variacionMes >= 15 && (stats.ingresos_mes_actual ?? 0) > 0) {
    return {
      text: 'Las ventas aceleraron durante el último mes.',
      kind: 'week-momentum',
      eventId: null,
    };
  }

  const leader = top[0];
  if (leader) {
    const titulo = String(leader.titulo || 'Tu evento líder');
    const id = Number(leader.id) || null;
    const boletas = Number(leader.boletas_vendidas ?? 0);
    const pct = boletas > 0 ? Math.min(99, Math.round((boletas / AFORO_REF) * 100)) : 0;
    if (pct >= 70) {
      return { text: `${titulo} ya superó el ${pct}% del aforo.`, kind: 'aforo-milestone', eventId: id };
    }
  }

  for (const evento of proximos) {
    const days = daysUntil(evento?.fecha_inicio);
    const titulo = String(evento?.titulo || 'Tu evento');
    const id = Number(evento?.id) || null;
    if (days === 0) {
      return { text: `Hoy es el día de ${titulo}.`, kind: 'event-countdown', eventId: id };
    }
    if (days === 1) {
      return { text: `Mañana es ${titulo} — todo listo para operar.`, kind: 'event-countdown', eventId: id };
    }
    if (days != null && days <= 7) {
      return { text: `Faltan ${days} días para ${titulo}.`, kind: 'event-countdown', eventId: id };
    }
  }

  const activos = stats.eventos_activos ?? 0;
  if (activos === 0 && (stats.eventos_totales ?? 0) === 0) {
    return { text: 'Crea tu primer evento para poner tu negocio en marcha.', kind: 'general', eventId: null };
  }
  if ((stats.boletas_vendidas ?? 0) === 0 && activos > 0) {
    return {
      text: 'Tus eventos están listos — activa la difusión para las primeras ventas.',
      kind: 'general',
      eventId: null,
    };
  }
  if ((stats.ventas_recientes ?? []).length > 0) {
    return { text: 'Tu negocio sigue en movimiento — hay actividad reciente.', kind: 'general', eventId: null };
  }
  return { text: 'Buen momento para revisar tu calendario y preparar el próximo paso.', kind: 'general', eventId: null };
}

/** Línea editorial del portafolio — nombres y estados, no cifras de KPIs. */
function buildStateLine(
  stats: DashboardStats,
  daysUntil: (fecha: string | Date | null | undefined) => number | null,
): string {
  const proximos = stats.eventos_proximos ?? [];
  const parts: string[] = [];

  const titulos = proximos.slice(0, 2).map((e) => String(e.titulo || 'Evento').trim()).filter(Boolean);
  if (titulos.length === 1) {
    parts.push(`En cartelera: ${titulos[0]}`);
  } else if (titulos.length >= 2) {
    parts.push(`${titulos[0]} y ${titulos[1]} en cartelera`);
  }

  const borradores = proximos.filter((e) => {
    const st = String(e.estado || '').toLowerCase();
    return st && st !== 'publicado';
  });
  if (borradores.length === 1) {
    parts.push('un evento pendiente de publicar');
  } else if (borradores.length > 1) {
    parts.push(`${borradores.length} eventos pendientes de publicar`);
  }

  const proximo = proximos[0];
  if (proximo && parts.length === 0) {
    const days = daysUntil(proximo.fecha_inicio);
    const titulo = String(proximo.titulo || 'Próximo evento');
    if (days != null && days <= 14) {
      parts.push(`Calendario centrado en ${titulo}`);
    }
  }

  if (parts.length === 0) {
    return 'Tu centro de control de eventos';
  }
  return parts.join(' · ');
}

export function computeOcupacionPromedio(stats: DashboardStats): number {
  const top = stats.top_eventos ?? [];
  const pcts = top
    .map((e) => Number(e.boletas_vendidas ?? 0))
    .filter((b) => b > 0)
    .map((b) => Math.min(99, Math.round((b / AFORO_REF) * 100)));
  if (pcts.length > 0) {
    return Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
  }

  if (stats.tasa_asistencia != null && Number.isFinite(stats.tasa_asistencia)) {
    return Math.round(stats.tasa_asistencia);
  }

  const vendidas = stats.boletas_vendidas ?? 0;
  if (vendidas <= 0) return 0;
  const usadas = stats.boletas_por_estado?.find((b) => b.estado === 'usada')?.cantidad ?? 0;
  return Math.round((usadas / vendidas) * 100);
}

export function buildMetricCards(
  stats: DashboardStats,
  formatAmount: (v: number | null | undefined) => string,
): DashOrgMetricCard[] {
  const ocupacion = computeOcupacionPromedio(stats);

  return [
    {
      key: 'activos',
      question: 'Eventos activos',
      value: formatAmount(stats.eventos_activos),
      hint: 'En operación ahora',
      icon: 'event',
    },
    {
      key: 'boletas',
      question: 'Boletas vendidas',
      value: formatAmount(stats.boletas_vendidas),
      hint: 'En todo tu portafolio',
      icon: 'confirmation_number',
    },
    {
      key: 'ocupacion',
      question: 'Ocupación promedio',
      value: ocupacion > 0 ? `${ocupacion}%` : '—',
      hint: ocupacion > 0 ? 'Aforo vendido / asistencia' : 'Sin datos aún',
      icon: 'donut_large',
    },
  ];
}

export function buildAgendaCards(
  stats: DashboardStats,
  formatAmount: (v: number | null | undefined) => string,
  formatCurrency: (n: number) => string,
  daysUntil: (fecha: string | Date | null | undefined) => number | null,
  formatAgendaDate: (fecha: string | Date | null | undefined) => string,
): DashOrgAgendaCard[] {
  const top = stats.top_eventos ?? [];
  const leaderId = top[0]?.id != null ? Number(top[0].id) : null;
  const topMap = new Map(top.map((e) => [Number(e.id), e]));

  return (stats.eventos_proximos ?? []).map((evento) => {
    const id = Number(evento.id);
    const row = topMap.get(id) as
      | {
          boletas_vendidas?: number;
          recibiras_aprox?: number;
          valor_servicio?: number;
          wompi_ventas?: number;
          clientes_pagaron?: number;
        }
      | undefined;
    const boletas = Number(row?.boletas_vendidas ?? 0);
    const aforoPct = boletas > 0 ? Math.min(99, Math.round((boletas / AFORO_REF) * 100)) : null;
    const recibirasRaw = Math.max(0, Number(row?.recibiras_aprox ?? 0));
    const servicioRaw = Math.max(0, Number(row?.valor_servicio ?? 0));
    const wompiRaw = Math.max(0, Number(row?.wompi_ventas ?? 0));
    const clientesPagaronRaw = Math.max(0, Number(row?.clientes_pagaron ?? 0));
    const hasFinanzas = clientesPagaronRaw > 0 || recibirasRaw > 0;
    const days = daysUntil(evento.fecha_inicio);
    let countdownLabel = 'Sin fecha';
    if (days != null) {
      if (days < 0) {
        countdownLabel = days === -1 ? 'Ayer' : `Hace ${Math.abs(days)} días`;
      } else {
        countdownLabel = days === 0 ? 'Hoy' : days === 1 ? 'Mañana' : `En ${days} días`;
      }
    }

    const estado = String(evento.estado || '').toLowerCase();
    const estadoLabel =
      estado === 'publicado' ? 'Publicado' : estado === 'borrador' ? 'Borrador' : estado || null;

    return {
      id,
      titulo: String(evento.titulo || 'Evento'),
      fechaLabel: formatAgendaDate(evento.fecha_inicio),
      countdownLabel,
      boletasLabel: boletas > 0 ? `${formatAmount(boletas)} boletas` : 'Sin ventas aún',
      aforoPct,
      clientesPagaronLabel: hasFinanzas ? formatCurrency(clientesPagaronRaw) : null,
      ingresosLabel: hasFinanzas ? formatCurrency(recibirasRaw) : null,
      servicioLabel: hasFinanzas ? formatCurrency(servicioRaw) : null,
      wompiLabel: hasFinanzas ? formatCurrency(wompiRaw) : null,
      estadoLabel,
      isSalesLeader: leaderId != null && id === leaderId && boletas > 0,
      hasFinanzas,
    };
  });
}

export function buildActivityFeed(stats: DashboardStats): OrgSalesRowModel[] {
  return (stats.ventas_recientes ?? []).map((venta, index) => mapVentaToOrgSalesRow(venta, index));
}

/** Evita repetir en Atención lo que el hero insight ya narró. */
export function filterAttentionForHero(
  items: DashOrgAttentionItem[],
  hero: Pick<DashOrgHeroView, 'insightKind' | 'insightEventId'>,
): DashOrgAttentionItem[] {
  if (hero.insightKind === 'draft-urgency' && hero.insightEventId != null) {
    return items.filter((item) => item.key !== `draft-${hero.insightEventId}`);
  }
  if (hero.insightKind === 'event-countdown' && hero.insightEventId != null) {
    return items.filter((item) => item.key !== `soon-${hero.insightEventId}`);
  }
  return items;
}

export function formatRelativeTime(fecha: string | Date | null | undefined): string {
  if (!fecha) return 'Recientemente';
  const date = typeof fecha === 'string'
    ? DateTimeUtil.parseStoredDate(fecha)
    : fecha;
  if (Number.isNaN(date.getTime())) return 'Recientemente';

  // Una diferencia negativa pequeña puede ocurrir por desfase entre el reloj
  // del navegador y el servidor. En ese caso se considera una venta reciente.
  const diffMs = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 1) return 'Hace un momento';
  if (minutes < 5) return 'Hace unos minutos';
  if (minutes < 60) return `Hace ${minutes} minutos`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? 'Hace 1 hora' : `Hace ${hours} horas`;

  const days = Math.floor(hours / 24);
  return days === 1 ? 'Hace 1 día' : `Hace ${days} días`;
}

export function formatAgendaDate(fecha: string | Date | null | undefined): string {
  if (!fecha) return '—';
  const date = new Date(typeof fecha === 'string' ? fecha : fecha.toISOString());
  if (Number.isNaN(date.getTime())) return '—';
  const day = date.getDate();
  const month = date.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '');
  return `${day} ${month.charAt(0).toUpperCase() + month.slice(1)}`;
}

export function getVariacionPorcentual(actual: number, anterior: number): number {
  if (anterior === 0) return actual > 0 ? 100 : 0;
  return Math.round(((actual - anterior) / anterior) * 100);
}
