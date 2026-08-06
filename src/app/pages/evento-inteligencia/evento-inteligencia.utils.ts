import { Evento, TipoBoleta, TipoEstadoEvento, DashboardStats } from '../../types';
import { ReporteEvento, ReporteVentas } from '../../services/reportes.service';
import {
  IntelActionNow,
  IntelAforoTotals,
  IntelCountdown,
  IntelHeroMoment,
  IntelPulseCard,
  IntelStorySection,
  IntelCtaAction,
} from './evento-inteligencia.types';

interface BoletaRankingInput {
  nombre: string;
  vendidas: number;
  total: number;
  pct: number;
  ingresosEst: number;
}

interface ProductoRowInput {
  nombre: string;
  vendidas: number;
  ingresosEst: number;
}

export function computeAforoTotals(tipos: TipoBoleta[]): IntelAforoTotals {
  let vendidas = 0;
  let total = 0;
  for (const t of tipos) {
    vendidas += t.cantidad_vendidas ?? 0;
    total += t.cantidad_total ?? 0;
  }
  const pct = total > 0 ? Math.round((vendidas / total) * 100) : 0;
  return { vendidas, total, pct };
}

export function computeRecaudoTotal(reporte: ReporteEvento | null, stats: DashboardStats | null): number {
  const entradas = reporte?.ingresos ?? 0;
  const productos = stats?.ingresos_productos_totales ?? 0;
  return entradas + productos;
}

function buildCountdown(fechaInicio: Date | string | undefined, now: Date): IntelCountdown | null {
  if (!fechaInicio) {
    return null;
  }
  const start = new Date(typeof fechaInicio === 'string' ? fechaInicio : fechaInicio.toISOString());
  if (Number.isNaN(start.getTime())) {
    return null;
  }
  const diffMs = start.getTime() - now.getTime();
  if (diffMs <= 0) {
    return null;
  }
  const totalMinutes = Math.floor(diffMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  return { days, hours, minutes };
}

export function buildHeroMoment(evento: Evento, aforo: IntelAforoTotals, now = new Date()): IntelHeroMoment {
  const estado = evento.estado as TipoEstadoEvento;
  const countdown = buildCountdown(evento.fecha_inicio, now);
  const aforoPct = aforo.pct;

  let headline: string;
  let countdownCaption: string;
  let showCountdown = false;

  switch (estado) {
    case TipoEstadoEvento.EN_CURSO:
      headline = 'Tu evento está en curso ahora mismo';
      countdownCaption = 'En vivo';
      break;
    case TipoEstadoEvento.FINALIZADO:
      headline = 'Este evento ya finalizó';
      countdownCaption = 'Finalizado';
      break;
    case TipoEstadoEvento.CANCELADO:
      headline = 'Evento cancelado';
      countdownCaption = 'Cancelado';
      break;
    default:
      if (countdown) {
        if (countdown.days > 0) {
          headline =
            countdown.days === 1
              ? 'Falta 1 día para el evento'
              : `Faltan ${countdown.days} días para el evento`;
        } else if (countdown.hours > 0) {
          headline =
            countdown.hours === 1
              ? 'Falta 1 hora para el evento'
              : `Faltan ${countdown.hours} horas para el evento`;
        } else {
          headline = 'El evento comienza en minutos';
        }
        countdownCaption = 'Cuenta regresiva';
        showCountdown = true;
      } else if (evento.fecha_inicio) {
        const start = new Date(evento.fecha_inicio as string);
        headline =
          start.getTime() <= now.getTime()
            ? 'El evento ya debería haber comenzado'
            : 'Tu evento está en preparación';
        countdownCaption = 'Sin cuenta regresiva';
      } else {
        headline = 'Define las fechas de tu evento para comenzar';
        countdownCaption = 'Fecha pendiente';
      }
      break;
  }

  const disponibles = Math.max(0, aforo.total - aforo.vendidas);

  let aforoLine: string;
  let availabilityLine: string;
  let salesPhrase: string;
  let salesDetail: string;

  if (aforo.total === 0) {
    aforoLine = 'Aforo sin configurar';
    availabilityLine = 'Configura tus entradas en Operaciones';
    salesPhrase = 'Aún no hay aforo configurado';
    salesDetail = 'Cuando definas tus boletas, podrás seguir el avance aquí';
  } else if (aforo.vendidas === 0) {
    aforoLine = `${aforoPct}% del aforo vendido`;
    availabilityLine = `${disponibles.toLocaleString('es-CO')} entradas disponibles`;
    salesPhrase = 'Todavía no se han vendido entradas';
    salesDetail = 'Todo listo para que empieces a vender';
  } else if (aforoPct >= 100) {
    aforoLine = '100% del aforo vendido';
    availabilityLine = 'Sin entradas disponibles';
    salesPhrase = '¡Vendiste todo tu aforo!';
    salesDetail = `${aforo.vendidas.toLocaleString('es-CO')} entradas comercializadas`;
  } else {
    aforoLine = `${aforoPct}% del aforo vendido`;
    availabilityLine = `${disponibles.toLocaleString('es-CO')} entradas disponibles`;
    salesPhrase = `Llevas ${aforo.vendidas.toLocaleString('es-CO')} de ${aforo.total.toLocaleString('es-CO')} entradas vendidas`;
    salesDetail =
      aforoPct >= 80
        ? 'Vas muy bien — quedan pocas por vender'
        : 'Aún hay margen para seguir creciendo';
  }

  return {
    headline,
    aforoLine,
    availabilityLine,
    disponibles,
    salesPhrase,
    salesDetail,
    aforoPct,
    countdown,
    countdownCaption,
    showCountdown,
  };
}

function formatVariacionRecaudo(stats: DashboardStats | null): string | null {
  if (!stats) {
    return null;
  }
  const hoy = stats.ingresos_dia_actual ?? 0;
  const ayer = stats.ingresos_dia_anterior ?? 0;
  if (hoy === 0 && ayer === 0) {
    return null;
  }
  if (ayer === 0 && hoy > 0) {
    return 'Hoy registraste tus primeros ingresos del día';
  }
  const delta = Math.round(((hoy - ayer) / ayer) * 100);
  if (delta > 0) {
    return `Un ${delta}% más de ingresos por entradas que ayer`;
  }
  if (delta < 0) {
    return `Un ${Math.abs(delta)}% menos de ingresos por entradas que ayer`;
  }
  return 'Mismo ritmo de ingresos por entradas que ayer';
}

export function buildPulseCards(
  reporte: ReporteEvento | null,
  stats: DashboardStats | null,
  aforo: IntelAforoTotals,
  formatCurrency: (n: number) => string,
): IntelPulseCard[] {
  const recaudo = computeRecaudoTotal(reporte, stats);
  const boletasVendidas = reporte?.boletas_vendidas ?? 0;
  const asistentes = reporte?.boletas_usadas ?? 0;
  const variacion = formatVariacionRecaudo(stats);
  const pctProductos =
    recaudo > 0 ? Math.round(((stats?.ingresos_productos_totales ?? 0) / recaudo) * 100) : 0;
  const tasaIngreso = boletasVendidas > 0 ? Math.round((asistentes / boletasVendidas) * 100) : 0;

  let recaudoPhrase: string;
  let recaudoDetail: string;
  if (recaudo === 0) {
    recaudoPhrase = 'Aún no hay recaudo registrado';
    recaudoDetail = 'Cuando lleguen las primeras ventas, lo verás reflejado aquí';
  } else if (pctProductos > 0) {
    recaudoPhrase = 'Recaudo acumulado de entradas y productos';
    recaudoDetail =
      variacion ?? `Los productos aportan el ${pctProductos}% de lo recaudado`;
  } else {
    recaudoPhrase = 'Todo tu recaudo proviene de entradas';
    recaudoDetail = variacion ?? 'Buen punto de partida para medir el crecimiento';
  }

  let aforoPhrase: string;
  let aforoDetail: string;
  if (aforo.total === 0) {
    aforoPhrase = 'Configura tus entradas para empezar a medir';
    aforoDetail = 'Desde Operaciones puedes definir tipos y cupos';
  } else if (aforo.vendidas === 0) {
    aforoPhrase = 'Todavía no se han vendido entradas';
    aforoDetail = `${aforo.total.toLocaleString('es-CO')} entradas listas para comercializar`;
  } else if (aforo.pct >= 100) {
    aforoPhrase = '¡Completaste todo tu aforo!';
    aforoDetail = 'Excelente demanda — evalúa abrir más cupos si lo necesitas';
  } else {
    aforoPhrase = `${aforo.pct}% de tu aforo ya está vendido`;
    aforoDetail = `Quedan ${(aforo.total - aforo.vendidas).toLocaleString('es-CO')} entradas por vender`;
  }

  let asistentesPhrase: string;
  let asistentesDetail: string;
  if (boletasVendidas === 0) {
    asistentesPhrase = 'Todo listo para recibir asistentes';
    asistentesDetail = 'Cuando vendas entradas, podrás registrar ingresos en puerta';
  } else if (asistentes === 0) {
    asistentesPhrase = 'Aún no hay ingresos registrados';
    asistentesDetail = `${boletasVendidas.toLocaleString('es-CO')} entradas vendidas esperando en puerta`;
  } else if (tasaIngreso >= 80) {
    asistentesPhrase = 'La mayoría de tus asistentes ya ingresó';
    asistentesDetail = `${asistentes.toLocaleString('es-CO')} personas dentro — ${tasaIngreso}% del total vendido`;
  } else if (tasaIngreso >= 40) {
    asistentesPhrase = 'El ingreso va tomando ritmo';
    asistentesDetail = `${asistentes.toLocaleString('es-CO')} de ${boletasVendidas.toLocaleString('es-CO')} entradas vendidas ya pasaron puerta`;
  } else {
    asistentesPhrase = `${asistentes.toLocaleString('es-CO')} asistentes registrados`;
    asistentesDetail =
      tasaIngreso > 0
        ? `El ${tasaIngreso}% de quienes compró ya ingresó — revisa los accesos`
        : 'Usa el escáner para registrar cada ingreso';
  }

  return [
    {
      id: 'recaudo',
      icon: 'payments',
      label: 'Recaudo total',
      value: formatCurrency(recaudo),
      phrase: recaudoPhrase,
      detail: recaudoDetail,
    },
    {
      id: 'aforo',
      icon: 'confirmation_number',
      label: 'Aforo vendido',
      value: aforo.total > 0 ? `${aforo.pct}%` : '—',
      phrase: aforoPhrase,
      detail: aforoDetail,
      barPct: aforo.total > 0 ? aforo.pct : 0,
    },
    {
      id: 'asistentes',
      icon: 'groups',
      label: 'Asistentes',
      value: asistentes.toLocaleString('es-CO'),
      phrase: asistentesPhrase,
      detail: asistentesDetail,
    },
  ];
}

export function buildActionNow(
  evento: Evento,
  reporte: ReporteEvento | null,
  aforo: IntelAforoTotals,
  hero: IntelHeroMoment,
): IntelActionNow {
  const estado = evento.estado as TipoEstadoEvento;
  const boletasVendidas = reporte?.boletas_vendidas ?? 0;
  const asistentes = reporte?.boletas_usadas ?? 0;
  const daysLeft = hero.countdown?.days ?? null;

  if (estado === TipoEstadoEvento.EN_CURSO) {
    if (boletasVendidas > 0 && asistentes < boletasVendidas * 0.3) {
      return {
        variant: 'warning',
        message: `Hay ${boletasVendidas} boletas vendidas pero solo ${asistentes} ingresos. Abre el escáner en puerta.`,
        ctaLabel: 'Abrir escáner',
        ctaAction: 'escanear',
      };
    }
    return {
      variant: 'info',
      message: 'Tu evento está en curso. Monitorea ingresos en tiempo real desde el escáner.',
      ctaLabel: 'Ir al escáner',
      ctaAction: 'escanear',
    };
  }

  if (estado === TipoEstadoEvento.FINALIZADO || estado === TipoEstadoEvento.CANCELADO) {
    return {
      variant: 'info',
      message: 'Consulta el desglose abajo o vuelve a Operaciones para revisar el cierre.',
      ctaLabel: 'Centro de Operaciones',
      ctaAction: 'operaciones',
    };
  }

  if (boletasVendidas === 0) {
    return {
      variant: 'warning',
      message: 'Aún no hay ventas. Publica tu evento y compártelo con tu audiencia para arrancar.',
      ctaLabel: 'Compartir evento',
      ctaAction: 'share',
    };
  }

  if (daysLeft != null && daysLeft <= 7 && aforo.pct < 50 && aforo.total > 0) {
    const restantes = aforo.total - aforo.vendidas;
    return {
      variant: 'warning',
      message: `Quedan ${daysLeft} día${daysLeft === 1 ? '' : 's'} y te faltan ${restantes} boletas por vender. Refuerza la difusión.`,
      ctaLabel: 'Compartir evento',
      ctaAction: 'share',
    };
  }

  if (aforo.pct >= 80 && aforo.total > 0 && aforo.vendidas < aforo.total) {
    return {
      variant: 'success',
      message: `Has vendido el ${aforo.pct}% del aforo. Evalúa liberar más cupos si la demanda sigue.`,
      ctaLabel: 'Gestionar boletas',
      ctaAction: 'boletas',
    };
  }

  if (hero.aforoPct >= 50) {
    return {
      variant: 'success',
      message: `Vas bien: ${hero.salesPhrase.toLowerCase()}. Mantén el momentum compartiendo tu evento.`,
      ctaLabel: 'Compartir evento',
      ctaAction: 'share',
    };
  }

  return {
    variant: 'info',
    message: hero.salesDetail,
    ctaLabel: 'Compartir evento',
    ctaAction: 'share',
  };
}

export function formatIntelCurrency(value: number): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) {
    return '$0';
  }
  if (n >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (n >= 10_000) {
    return `$${Math.round(n / 1_000)}K`;
  }
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n);
}

export function padCountdown(n: number): string {
  return n.toString().padStart(2, '0');
}

export function buildVentasStory(
  reporte: ReporteEvento | null,
  stats: DashboardStats | null,
  ventas7d: ReporteVentas[],
  formatCurrency: (n: number) => string,
): IntelStorySection {
  const recaudo = computeRecaudoTotal(reporte, stats);
  const entradas = reporte?.ingresos ?? 0;
  const productos = stats?.ingresos_productos_totales ?? 0;
  const variacion = formatVariacionRecaudo(stats);
  const ingresos7d = ventas7d.reduce((s, d) => s + (d.ingresos ?? 0), 0);
  const diasConVentas = ventas7d.filter((d) => (d.ingresos ?? 0) > 0).length;

  if (recaudo === 0) {
    return {
      id: 'ventas',
      question: '¿Cómo van mis ventas?',
      headline: '',
      narrative: '',
      empty: true,
      emptyHeadline: 'No hay recaudo todavía',
      emptyNarrative:
        'Tu evento está listo para vender, pero aún no se ha registrado ningún ingreso. Comparte tu evento para comenzar a generar ventas.',
      ctaLabel: 'Compartir evento',
      ctaAction: 'share',
    };
  }

  let narrative: string;
  if (productos > 0 && entradas > 0) {
    narrative = `Llevas ${formatCurrency(recaudo)} acumulados entre entradas (${formatCurrency(entradas)}) y productos (${formatCurrency(productos)}). Tu negocio ya tiene diversificación de ingresos.`;
  } else if (productos > 0) {
    narrative = `Tu recaudo de ${formatCurrency(recaudo)} proviene principalmente de productos. Las entradas pueden ser tu próxima palanca de crecimiento.`;
  } else {
    narrative = `Llevas ${formatCurrency(recaudo)} recaudados solo con entradas. Es una base sólida para seguir construyendo.`;
  }

  let insight: string | undefined;
  if (variacion) {
    insight = variacion;
  } else if (ingresos7d > 0) {
    insight = `En los últimos 7 días sumaste ${formatCurrency(ingresos7d)} por entradas${diasConVentas < 7 ? `, con actividad en ${diasConVentas} día${diasConVentas === 1 ? '' : 's'}` : ''}.`;
  }

  return {
    id: 'ventas',
    question: '¿Cómo van mis ventas?',
    headline: formatCurrency(recaudo),
    narrative,
    insight,
    empty: false,
    ctaLabel: recaudo > 0 && (reporte?.boletas_vendidas ?? 0) < 10 ? 'Compartir evento' : undefined,
    ctaAction: recaudo > 0 && (reporte?.boletas_vendidas ?? 0) < 10 ? 'share' : undefined,
  };
}

export function buildHoyStory(
  stats: DashboardStats | null,
  reporte: ReporteEvento | null,
  formatCurrency: (n: number) => string,
): IntelStorySection {
  const hoy = stats?.ingresos_dia_actual ?? 0;
  const ayer = stats?.ingresos_dia_anterior ?? 0;
  const boletasHoy = reporte?.boletas_vendidas ?? 0;

  if (hoy === 0 && ayer === 0) {
    return {
      id: 'hoy',
      question: '¿Qué está pasando hoy?',
      headline: '',
      narrative: '',
      empty: true,
      emptyHeadline: 'Sin movimiento hoy',
      emptyNarrative:
        boletasHoy === 0
          ? 'Hoy no hay ventas registradas. Es un buen momento para compartir tu evento y activar la difusión.'
          : 'Hoy no entró dinero nuevo, pero ya tienes ventas previas. Mantén la comunicación con quienes compraron.',
      ctaLabel: boletasHoy === 0 ? 'Compartir evento' : 'Ver operaciones',
      ctaAction: boletasHoy === 0 ? 'share' : 'operaciones',
    };
  }

  let headline: string;
  let narrative: string;
  let insight: string | undefined;
  let ctaLabel: string | undefined;
  let ctaAction: IntelCtaAction | undefined;

  if (hoy === 0 && ayer > 0) {
    headline = 'Hoy va más tranquilo';
    narrative = `Ayer registraste ${formatCurrency(ayer)} en entradas. Hoy aún no hay ingresos nuevos — considera un recordatorio a tu audiencia.`;
    ctaLabel = 'Compartir evento';
    ctaAction = 'share';
  } else if (ayer === 0 && hoy > 0) {
    headline = formatCurrency(hoy);
    narrative = '¡Buenas noticias! Hoy registraste tus primeros ingresos del día. Es señal de que la difusión está funcionando.';
  } else {
    headline = formatCurrency(hoy);
    const delta = ayer > 0 ? Math.round(((hoy - ayer) / ayer) * 100) : null;
    narrative =
      delta != null && delta > 0
        ? `Hoy llevas ${formatCurrency(hoy)} — un ${delta}% más que ayer. El ritmo de ventas está subiendo.`
        : delta != null && delta < 0
          ? `Hoy llevas ${formatCurrency(hoy)} — un ${Math.abs(delta)}% menos que ayer. Un empujón de difusión puede ayudar.`
          : `Hoy llevas ${formatCurrency(hoy)}, mismo ritmo que ayer. Consistencia es buena señal.`;
    if (delta != null && delta < 0) {
      insight = 'Refuerza la difusión en redes o envía un recordatorio a tu lista.';
      ctaLabel = 'Compartir evento';
      ctaAction = 'share';
    }
  }

  return {
    id: 'hoy',
    question: '¿Qué está pasando hoy?',
    headline,
    narrative,
    insight,
    empty: false,
    ctaLabel,
    ctaAction,
  };
}

export function buildAforoStory(
  ranking: BoletaRankingInput[],
  aforo: IntelAforoTotals,
): IntelStorySection {
  if (ranking.length === 0 || aforo.total === 0) {
    return {
      id: 'aforo',
      question: '¿Qué está funcionando mejor?',
      headline: '',
      narrative: '',
      empty: true,
      emptyHeadline: 'Aún no hay tipos de boleta',
      emptyNarrative:
        'Configura tus entradas en Operaciones para ver qué tipos generan más demanda y optimizar tu estrategia de precios.',
      ctaLabel: 'Configurar boletas',
      ctaAction: 'boletas',
    };
  }

  const top = ranking[0];
  const conVentas = ranking.filter((r) => r.vendidas > 0);

  if (conVentas.length === 0) {
    return {
      id: 'aforo',
      question: '¿Qué está funcionando mejor?',
      headline: '',
      narrative: '',
      empty: true,
      emptyHeadline: 'Ninguna entrada vendida aún',
      emptyNarrative: `Tienes ${aforo.total.toLocaleString('es-CO')} entradas disponibles en ${ranking.length} tipo${ranking.length === 1 ? '' : 's'}. Comparte tu evento para descubrir cuál genera más interés.`,
      ctaLabel: 'Compartir evento',
      ctaAction: 'share',
    };
  }

  const headline = top.nombre;
  let narrative: string;
  if (conVentas.length === 1) {
    narrative = `"${top.nombre}" concentra todas tus ventas: ${top.vendidas} de ${top.total} (${top.pct}%). Por ahora es tu única referencia de demanda.`;
  } else {
    narrative = `"${top.nombre}" lidera con ${top.vendidas} vendidas (${top.pct}% de su cupo). Es el tipo que más resuena con tu audiencia.`;
  }

  const insight =
    top.pct >= 80 && top.vendidas < top.total
      ? `"${top.nombre}" está cerca de agotarse — evalúa liberar más cupos o crear un tipo similar.`
      : conVentas.length > 1 && ranking[1]
        ? `En segundo lugar va "${ranking[1].nombre}" con ${ranking[1].vendidas} vendidas.`
        : undefined;

  return {
    id: 'aforo',
    question: '¿Qué está funcionando mejor?',
    headline,
    narrative,
    insight,
    empty: false,
    ctaLabel: top.pct >= 80 ? 'Gestionar boletas' : undefined,
    ctaAction: top.pct >= 80 ? 'boletas' : undefined,
  };
}

export function buildProductosStory(
  productosCount: number,
  rows: ProductoRowInput[],
  formatCurrency: (n: number) => string,
): IntelStorySection | null {
  if (productosCount === 0) {
    return null;
  }

  if (rows.length === 0) {
    return {
      id: 'productos',
      question: '¿Qué oportunidades tengo?',
      headline: '',
      narrative: '',
      empty: true,
      emptyHeadline: 'Productos listos, sin ventas aún',
      emptyNarrative: `Tienes ${productosCount} producto${productosCount === 1 ? '' : 's'} configurado${productosCount === 1 ? '' : 's'}. Cuando el evento esté en marcha, pueden sumar ingresos extra sin depender solo de las entradas.`,
      ctaLabel: 'Administrar productos',
      ctaAction: 'productos',
    };
  }

  const top = rows[0];
  const totalIngresos = rows.reduce((s, r) => s + r.ingresosEst, 0);

  return {
    id: 'productos',
    question: '¿Qué oportunidades tengo?',
    headline: top.nombre,
    narrative: `"${top.nombre}" es tu producto estrella con ${top.vendidas} unidades vendidas (~${formatCurrency(top.ingresosEst)}). Los productos ya aportan ${formatCurrency(totalIngresos)} a tu recaudo.`,
    insight:
      rows.length > 1
        ? `"${rows[1].nombre}" le sigue con ${rows[1].vendidas} unidades — considera destacarlo en la comunicación del evento.`
        : 'Amplía tu catálogo si ves demanda constante en puerta.',
    empty: false,
    ctaLabel: 'Administrar productos',
    ctaAction: 'productos',
  };
}
