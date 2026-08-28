import { Evento, TipoBoleta, TipoEstadoEvento, DashboardStats } from '../../types';
import { ReporteEvento, ReporteVentas } from '../../services/reportes.service';
import {
  buildFinanzasOrganizadorView,
  getRecaudoBrutoConsolidado,
  resolveMostrarProductos,
  formatFinanzasMonedaExacta,
} from '../../utils/dashboard-finanzas.view';
import { DateTimeUtil } from '../../utils/date-time.util';
import {
  IntelActionNow,
  IntelAforoTotals,
  IntelCountdown,
  IntelFinanzasHeroView,
  IntelHeroMoment,
  IntelHoyInsight,
  IntelHoySection,
  IntelOportunidad,
  IntelOportunidadesSection,
  IntelPulseCard,
  IntelRankingRow,
  IntelRankingSection,
  IntelVentasSection,
  IntelCtaAction,
  IntelCtaVariant,
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


export function buildIntelFinanzasHero(
  stats: DashboardStats | null,
  formatCurrency: (n: number) => string,
  formatAmount: (n: number) => string,
): IntelFinanzasHeroView {
  const showProductos = resolveMostrarProductos(stats);
  if (!stats) {
    return {
      empty: true,
      showProductos,
      ventasGeneradas: formatAmount(0),
      ventasGeneradasMoneda: formatCurrency(0),
      ventasGeneradasBoletas: formatAmount(0),
      ventasGeneradasProductos: formatAmount(0),
      descuentosEstimados: formatCurrency(0),
      servicioEventum: formatCurrency(0),
      comisionWompi: formatCurrency(0),
      servicioPct: 0,
      wompiPct: 0,
      showDeducciones: false,
      recibirasAprox: formatAmount(0),
      recibirasAproxMoneda: formatCurrency(0),
      recibirasAproxBoletas: formatAmount(0),
      recibirasAproxProductos: formatAmount(0),
    };
  }

  const fin = buildFinanzasOrganizadorView(stats, showProductos);

  return {
    empty: fin.recaudoBruto === 0 && fin.saldoEstimadoRecibir === 0,
    showProductos,
    ventasGeneradas: formatAmount(fin.recaudoBruto),
    ventasGeneradasMoneda: formatCurrency(fin.recaudoBruto),
    ventasGeneradasBoletas: formatAmount(fin.recaudoBrutoBoletas),
    ventasGeneradasProductos: formatAmount(fin.recaudoBrutoProductos),
    descuentosEstimados: formatCurrency(fin.descuentosEstimados),
    servicioEventum: formatCurrency(fin.servicioEventum),
    comisionWompi: formatCurrency(fin.comisionWompi),
    servicioPct: fin.servicioPct,
    wompiPct: fin.wompiPct,
    showDeducciones: fin.descuentosEstimados > 0,
    recibirasAprox: formatAmount(fin.saldoEstimadoRecibir),
    recibirasAproxMoneda: formatCurrency(fin.saldoEstimadoRecibir),
    recibirasAproxBoletas: formatAmount(fin.saldoEstimadoRecibirBoletas),
    recibirasAproxProductos: formatAmount(fin.saldoEstimadoRecibirProductos),
  };
}

export function buildPulseCards(
  reporte: ReporteEvento | null,
  stats: DashboardStats | null,
  aforo: IntelAforoTotals,
  options?: { hideScanner?: boolean },
): IntelPulseCard[] {
  const hideScanner = options?.hideScanner === true;
  const boletasVendidas = reporte?.boletas_vendidas ?? 0;
  const asistentes = reporte?.boletas_usadas ?? 0;
  const tasaIngreso = boletasVendidas > 0 ? Math.round((asistentes / boletasVendidas) * 100) : 0;

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
    asistentesDetail = 'Cuando vendas entradas, podrás registrar asistentes en puerta';
  } else if (asistentes === 0) {
    asistentesPhrase = 'Aún no hay asistentes en puerta';
    asistentesDetail = `${boletasVendidas.toLocaleString('es-CO')} entradas vendidas esperando acceso`;
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
        : hideScanner
          ? 'Aún no hay registros de ingreso en puerta'
          : 'Usa el escáner para registrar cada ingreso';
  }

  return [
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
  options?: { hideScanner?: boolean },
): IntelActionNow {
  const hideScanner = options?.hideScanner === true;
  const estado = evento.estado as TipoEstadoEvento;
  const boletasVendidas = reporte?.boletas_vendidas ?? 0;
  const asistentes = reporte?.boletas_usadas ?? 0;
  const daysLeft = hero.countdown?.days ?? null;

  if (estado === TipoEstadoEvento.EN_CURSO) {
    if (hideScanner) {
      if (boletasVendidas > 0 && asistentes < boletasVendidas * 0.3) {
        return {
          variant: 'warning',
          message: `Hay ${boletasVendidas} boletas vendidas pero solo ${asistentes} asistentes registrados en puerta.`,
          ctaLabel: 'Ver operaciones',
          ctaAction: 'operaciones',
        };
      }
      return {
        variant: 'info',
        message: 'Tu evento está en curso. Sigue el ingreso desde Inteligencia.',
        ctaLabel: 'Ver métricas',
        ctaAction: 'operaciones',
      };
    }
    if (boletasVendidas > 0 && asistentes < boletasVendidas * 0.3) {
      return {
        variant: 'warning',
        message: `Hay ${boletasVendidas} boletas vendidas pero solo ${asistentes} asistentes en puerta. Abre el escáner.`,
        ctaLabel: 'Abrir escáner',
        ctaAction: 'escanear',
      };
    }
    return {
      variant: 'info',
      message: 'Tu evento está en curso. Monitorea el acceso en tiempo real desde el escáner.',
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
      message: `Vas bien: ${hero.salesPhrase.toLowerCase()}. Mantén el momentum con difusión puntual hacia tu audiencia.`,
      ctaLabel: 'Compartir evento',
      ctaAction: 'share',
    };
  }

  return {
    variant: 'info',
    message: hero.salesDetail,
    ctaLabel: 'Centro de operaciones',
    ctaAction: 'operaciones',
  };
}

export function formatIntelCurrency(value: number): string {
  return formatFinanzasMonedaExacta(value);
}

export function padCountdown(n: number): string {
  return n.toString().padStart(2, '0');
}

export function buildVentasSection(
  stats: DashboardStats | null,
  formatCurrency: (n: number) => string,
): IntelVentasSection {
  const showProductos = resolveMostrarProductos(stats);
  const brutoConsolidado = stats ? getRecaudoBrutoConsolidado(stats, showProductos) : 0;

  if (!stats || brutoConsolidado === 0) {
    return {
      question: '¿Cómo van mis ventas?',
      empty: true,
      emptyMessage:
        'Cuando lleguen las primeras ventas, verás aquí el desglose por boletas y productos.',
      showProductos: false,
      clientesPagaronBoletas: formatCurrency(0),
      clientesPagaronProductos: formatCurrency(0),
      descuentosEstimados: formatCurrency(0),
      servicioEventum: formatCurrency(0),
      comisionWompi: formatCurrency(0),
      descuentosPct: 0,
      servicioPct: 0,
      wompiPct: 0,
      showDeducciones: false,
      recibirasAproxBoletas: formatCurrency(0),
      recibirasAproxProductos: formatCurrency(0),
      conclusion: 'Tu punto de partida es activar la difusión desde la recomendación de arriba.',
    };
  }

  const fin = buildFinanzasOrganizadorView(stats, showProductos);
  const tieneProductosBruto = fin.recaudoBrutoProductos > 0;
  const descuentosPct =
    fin.recaudoBruto > 0 ? Math.round((fin.descuentosEstimados / fin.recaudoBruto) * 100) : 0;
  const servicioPct = fin.servicioPct;
  const wompiPct = fin.wompiPct;

  const pctBoletasBruto =
    fin.recaudoBruto > 0 ? Math.round((fin.recaudoBrutoBoletas / fin.recaudoBruto) * 100) : 100;
  const pctProductosBruto =
    fin.recaudoBruto > 0 ? Math.round((fin.recaudoBrutoProductos / fin.recaudoBruto) * 100) : 0;

  let conclusion: string;
  if (tieneProductosBruto && fin.recaudoBrutoBoletas > 0) {
    conclusion =
      pctBoletasBruto >= 70
        ? `Las boletas concentran el ${pctBoletasBruto}% de lo que pagaron tus clientes. Los productos ya diversifican tu saldo.`
        : pctProductosBruto >= 40
          ? `Los productos representan un ${pctProductosBruto}% de lo pagado. Sigue impulsando boletas sin descuidar lo que vende en puerta.`
          : 'Tienes dos rubros activos. Equilibrar boletas y productos te da más estabilidad.';
  } else if (tieneProductosBruto) {
    conclusion =
      'Por ahora solo hay ventas de productos. Las boletas pueden ser tu próxima palanca de crecimiento.';
  } else {
    conclusion =
      'Todo lo que pagaron tus clientes viene de boletas. Es una base sólida para sumar productos o nuevos tipos.';
  }

  if (descuentosPct >= 15) {
    conclusion += ` Entre servicio (${servicioPct}%) y Wompi (${wompiPct}%), las deducciones suman el ${descuentosPct}% de lo pagado.`;
  }

  return {
    question: '¿Cómo van mis ventas?',
    empty: false,
    showProductos: tieneProductosBruto,
    clientesPagaronBoletas: formatCurrency(fin.recaudoBrutoBoletas),
    clientesPagaronProductos: formatCurrency(fin.recaudoBrutoProductos),
    descuentosEstimados: formatCurrency(fin.descuentosEstimados),
    servicioEventum: formatCurrency(fin.servicioEventum),
    comisionWompi: formatCurrency(fin.comisionWompi),
    descuentosPct,
    servicioPct,
    wompiPct,
    showDeducciones: fin.descuentosEstimados > 0,
    recibirasAproxBoletas: formatCurrency(fin.saldoEstimadoRecibirBoletas),
    recibirasAproxProductos: formatCurrency(fin.saldoEstimadoRecibirProductos),
    conclusion,
  };
}

export function buildBoletasRankingSection(
  ranking: BoletaRankingInput[],
  aforo: IntelAforoTotals,
  formatCurrency: (n: number) => string,
): IntelRankingSection {
  const question = '¿Qué boletas están funcionando mejor?';

  if (ranking.length === 0 || aforo.total === 0) {
    return {
      question,
      empty: true,
      emptyMessage: 'Configura tipos de boleta en Operaciones para ver cuál genera más demanda.',
      rows: [],
      conclusion: 'Sin tipos definidos, no hay forma de comparar qué precio o formato convence más.',
      ctaLabel: 'Configurar boletas',
      ctaAction: 'boletas',
      ctaVariant: 'secondary',
    };
  }

  const conVentas = ranking.filter((r) => r.vendidas > 0);

  if (conVentas.length === 0) {
    return {
      question,
      empty: true,
      emptyMessage: `Tienes ${ranking.length} tipo${ranking.length === 1 ? '' : 's'} configurado${ranking.length === 1 ? '' : 's'}, pero ninguna venta registrada todavía.`,
      rows: [],
      conclusion: 'Cuando lleguen las primeras compras, este ranking te dirá qué tipo convence primero.',
    };
  }

  const totalVendidas = conVentas.reduce((s, r) => s + r.vendidas, 0);
  const rows: IntelRankingRow[] = conVentas.map((r) => ({
    nombre: r.nombre,
    vendidas: r.vendidas,
    pct: totalVendidas > 0 ? Math.round((r.vendidas / totalVendidas) * 100) : r.pct,
    clientesPagaron: formatCurrency(r.ingresosEst),
    clientesPagaronRaw: r.ingresosEst,
  }));

  const top = rows[0];
  let conclusion: string;
  if (rows.length === 1) {
    conclusion = `"${top.nombre}" concentra el 100% de tus ventas por ahora. Es tu única referencia de demanda.`;
  } else if (top.pct != null && top.pct >= 50) {
    conclusion = `"${top.nombre}" concentra el ${top.pct}% de las entradas vendidas. Es claramente la preferida de tu audiencia.`;
  } else {
    conclusion = `"${top.nombre}" lidera, pero hay reparto entre varios tipos. Considera potenciar el segundo más vendido.`;
  }

  if (conVentas[0].pct >= 80 && conVentas[0].vendidas < conVentas[0].total) {
    conclusion += ` "${conVentas[0].nombre}" está cerca de agotarse — evalúa liberar más cupos.`;
  }

  return {
    question,
    empty: false,
    rows,
    conclusion,
    ctaLabel: conVentas[0].pct >= 80 ? 'Gestionar boletas' : undefined,
    ctaAction: conVentas[0].pct >= 80 ? 'boletas' : undefined,
    ctaVariant: 'secondary',
  };
}

export function buildProductosRankingSection(
  productosCount: number,
  rows: ProductoRowInput[],
  formatCurrency: (n: number) => string,
): IntelRankingSection | null {
  if (productosCount === 0) {
    return null;
  }

  const question = '¿Qué productos están funcionando mejor?';

  if (rows.length === 0) {
    return {
      question,
      empty: true,
      emptyMessage: `Tienes ${productosCount} producto${productosCount === 1 ? '' : 's'} listo${productosCount === 1 ? '' : 's'}, sin ventas registradas aún.`,
      rows: [],
      conclusion: 'Cuando el evento esté en marcha, aquí verás qué producto genera más ingreso por unidad.',
      ctaLabel: 'Ver catálogo',
      ctaAction: 'productos',
      ctaVariant: 'secondary',
    };
  }

  const totalIngresos = rows.reduce((s, r) => s + r.ingresosEst, 0);
  const rankingRows: IntelRankingRow[] = rows.map((r) => ({
    nombre: r.nombre,
    vendidas: r.vendidas,
    pct: totalIngresos > 0 ? Math.round((r.ingresosEst / totalIngresos) * 100) : 0,
    clientesPagaron: formatCurrency(r.ingresosEst),
    clientesPagaronRaw: r.ingresosEst,
  }));

  const top = rankingRows[0];
  let conclusion: string;
  if (rankingRows.length === 1) {
    conclusion = `"${top.nombre}" es tu único producto con ventas. Amplía el catálogo si ves demanda constante.`;
  } else if (top.pct != null && top.pct >= 50) {
    conclusion = `"${top.nombre}" genera el ${top.pct}% de lo que pagaron tus clientes por productos. Destácalo en comunicación y en puerta.`;
  } else {
    conclusion = `"${top.nombre}" lidera en productos, con reparto saludable entre ${rankingRows.length} activos.`;
  }

  return {
    question,
    empty: false,
    rows: rankingRows,
    conclusion,
    ctaLabel: 'Ver catálogo',
    ctaAction: 'productos',
    ctaVariant: 'secondary',
  };
}

function todayIsoLocal(): string {
  return DateTimeUtil.toCalendarDateKey(new Date().toISOString());
}

function isTodayLocal(fecha: string | Date | null | undefined): boolean {
  if (!fecha) return false;
  const raw = typeof fecha === 'string' ? fecha : fecha.toISOString();
  return DateTimeUtil.toCalendarDateKey(raw) === todayIsoLocal();
}

function hoyFormatRelativeTime(fecha: string | Date | null | undefined): string {
  if (!fecha) return 'Recientemente';
  const then = new Date(typeof fecha === 'string' ? fecha : fecha.toISOString()).getTime();
  if (!Number.isFinite(then)) return 'Recientemente';
  const diffMs = Date.now() - then;
  if (diffMs < 60_000) return 'Hace un momento';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return mins === 1 ? 'Hace 1 min' : `Hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours === 1 ? 'Hace 1 h' : `Hace ${hours} h`;
  return 'Hoy temprano';
}

function countVentasHoyDesdeRecientes(stats: DashboardStats | null): { entradas: number; productos: number } {
  let entradas = 0;
  let productos = 0;
  for (const venta of stats?.ventas_recientes ?? []) {
    if (!isTodayLocal(venta?.fecha_compra)) continue;
    const tipo = String(venta?.tipo_venta || venta?.source || 'ventas');
    if (tipo === 'productos') {
      productos += 1;
    } else {
      // Una compra puede contener varias boletas; contar unidades, no compras.
      const cantidad = Number(venta?.boletas_vendidas ?? venta?.boletas ?? 1);
      entradas += Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 1;
    }
  }
  return { entradas, productos };
}

function findUltimaVentaHoy(stats: DashboardStats | null): { fecha: string; total: number } | null {
  for (const venta of stats?.ventas_recientes ?? []) {
    if (!isTodayLocal(venta?.fecha_compra)) continue;
    return {
      fecha: String(venta.fecha_compra),
      total: Number(venta?.total ?? 0),
    };
  }
  return null;
}

function findHoraPicoHoy(stats: DashboardStats | null): string | null {
  const buckets = new Map<number, number>();
  for (const venta of stats?.ventas_recientes ?? []) {
    if (!isTodayLocal(venta?.fecha_compra)) continue;
    const h = new Date(String(venta.fecha_compra)).getHours();
    if (!Number.isFinite(h)) continue;
    buckets.set(h, (buckets.get(h) ?? 0) + 1);
  }
  if (buckets.size < 2) return null;
  let peakHour = 0;
  let peakCount = 0;
  for (const [hour, count] of buckets) {
    if (count > peakCount) {
      peakHour = hour;
      peakCount = count;
    }
  }
  const label = (h: number) => `${String(h).padStart(2, '0')}:00`;
  const next = (peakHour + 1) % 24;
  return `${label(peakHour)}–${label(next)}`;
}

export function buildHoySection(
  stats: DashboardStats | null,
  ventas7d: ReporteVentas[],
  tieneProductos: boolean,
  formatCurrency: (n: number) => string,
): IntelHoySection {
  const question = '¿Qué está pasando hoy?';
  const hoyIso = todayIsoLocal();
  const hoyData = ventas7d.find((v) => v.fecha === hoyIso);
  const ingresosHoy = stats?.ingresos_dia_actual ?? hoyData?.ingresos ?? 0;
  const ayer = stats?.ingresos_dia_anterior ?? 0;
  const ventasHoy = countVentasHoyDesdeRecientes(stats);
  // Reutiliza exactamente las mismas ventas recientes que alimentan
  // “Qué acaba de pasar”, donde ya se identifica correctamente el palco y su número.
  const ventasPalcosHoy = (stats?.ventas_recientes ?? [])
    .filter((venta) => {
      if (!isTodayLocal(venta?.fecha_compra)) return false;
      const numeros = Array.isArray(venta?.palcos_numeros) ? venta.palcos_numeros : [];
      return Number(venta?.palcos_vendidos ?? 0) > 0 || numeros.length > 0;
    });
  const palcosHoy = [...new Set(ventasPalcosHoy
    .flatMap((venta) => Array.isArray(venta?.palcos_numeros) ? venta.palcos_numeros : []))];
  const cantidadPalcosHoy = ventasPalcosHoy.reduce((total, venta) => {
    const cantidad = Number(venta?.palcos_vendidos ?? 0);
    const numeros = Array.isArray(venta?.palcos_numeros) ? venta.palcos_numeros : [];
    return total + (cantidad > 0 ? cantidad : numeros.length);
  }, 0);
  // Las ventas recientes contienen la cantidad real de boletas por compra.
  // La serie diaria (`ventas`) representa transacciones, por eso solo se usa
  // como respaldo cuando no hay detalle reciente del día.
  const entradasHoy = ventasHoy.entradas > 0
    ? ventasHoy.entradas
    : Number(hoyData?.boletas_vendidas ?? 0);
  const productosHoy = ventasHoy.productos;

  type InsightDraft = IntelHoyInsight;
  const insights: InsightDraft[] = [];
  const used = new Set<string>();

  const push = (id: string, icon: string, text: string, emphasis = true) => {
    if (used.has(id)) return;
    used.add(id);
    insights.push({ id, icon, text, emphasis });
  };

  const hasActividad = entradasHoy > 0 || ingresosHoy > 0 || productosHoy > 0 || cantidadPalcosHoy > 0;

  if (!hasActividad && ayer === 0) {
    push('sin-actividad', 'hourglass_empty', 'Sin ventas registradas hoy todavía.', true);
    push('tip-difusion', 'campaign', 'Es buen momento para activar difusión antes del cierre del día.', false);
    return {
      question,
      empty: false,
      insights,
    };
  }

  if (!hasActividad && ayer > 0) {
    push('sin-hoy', 'today', 'Hoy no hay movimiento registrado todavía.', true);
    push('ayer-ref', 'history', `Ayer tus clientes pagaron ${formatCurrency(ayer)}.`, false);
    push('tip-ritmo', 'bolt', 'Un recordatorio a tu audiencia puede reactivar el ritmo.', false);
    return {
      question,
      empty: false,
      insights,
    };
  }

  if (ingresosHoy > 0) {
    push(
      'ingresos',
      'payments',
      `Tus clientes pagaron ${formatCurrency(ingresosHoy)} en entradas hoy.`,
      true,
    );
  } else {
    push('sin-ingresos', 'payments', 'Hoy no se han registrado ingresos por entradas.', true);
  }

  if (entradasHoy > 0) {
    push(
      'entradas',
      'confirmation_number',
      entradasHoy === 1 ? '1 entrada vendida hoy.' : `${entradasHoy.toLocaleString('es-CO')} entradas vendidas hoy.`,
      true,
    );
  }

  if (cantidadPalcosHoy > 0) {
    push(
      'palcos',
      'table_restaurant',
      palcosHoy.length === 1
        ? `Se vendió el palco #${palcosHoy[0]}.`
        : palcosHoy.length > 1
          ? `Se vendieron los palcos ${palcosHoy.map((numero) => `#${numero}`).join(', ')}.`
          : cantidadPalcosHoy === 1 ? 'Se vendió un palco.' : `Se vendieron ${cantidadPalcosHoy} palcos.`,
      true,
    );
  }

  if (tieneProductos) {
    if (productosHoy > 0) {
      push(
        'productos',
        'local_mall',
        productosHoy === 1 ? '1 producto vendido hoy.' : `${productosHoy.toLocaleString('es-CO')} productos vendidos hoy.`,
        true,
      );
    } else {
      push('sin-productos', 'local_mall', 'No hubo ventas de productos registradas hoy.', false);
    }
  }

  const ultima = findUltimaVentaHoy(stats);
  if (ultima) {
    push('ultima-venta', 'schedule', `Última venta ${hoyFormatRelativeTime(ultima.fecha)}.`, false);
  }

  if (entradasHoy >= 2 && ingresosHoy > 0) {
    const ticket = Math.round(ingresosHoy / entradasHoy);
    push('ticket', 'receipt_long', `Ticket promedio hoy: ${formatCurrency(ticket)}.`, false);
  }

  const peakHour = findHoraPicoHoy(stats);
  if (peakHour) {
    push('hora-pico', 'schedule', `Mayor actividad entre ${peakHour}.`, false);
  }

  if (ayer > 0 && ingresosHoy > 0) {
    const delta = Math.round(((ingresosHoy - ayer) / ayer) * 100);
    if (delta > 0) {
      push('vs-ayer', 'trending_up', `Un ${delta}% más que ayer — mantén el momentum.`, false);
    } else if (delta < 0) {
      push(
        'vs-ayer',
        'trending_down',
        `Un ${Math.abs(delta)}% menos que ayer — refuerza difusión en horas clave.`,
        false,
      );
    } else {
      push('vs-ayer', 'trending_flat', 'Mismo ritmo que ayer — demanda estable.', false);
    }
  } else if (ayer === 0 && ingresosHoy > 0) {
    push('vs-ayer', 'rocket_launch', 'Buen arranque: hoy abre con ventas frescas.', false);
  } else if (ventas7d.length >= 3) {
    const prev = ventas7d.filter((v) => v.fecha !== hoyIso && v.ingresos > 0);
    if (prev.length >= 2) {
      const prom = prev.reduce((s, v) => s + v.ingresos, 0) / prev.length;
      if (prom > 0 && ingresosHoy > 0) {
        const delta = Math.round(((ingresosHoy - prom) / prom) * 100);
        if (Math.abs(delta) >= 8) {
          push(
            'vs-semana',
            'date_range',
            delta > 0
              ? `Vas un ${delta}% por encima del promedio de la semana.`
              : `Vas un ${Math.abs(delta)}% por debajo del promedio de la semana.`,
            false,
          );
        }
      }
    }
  }

  const maxInsights = 5;
  const trimmed = insights.slice(0, maxInsights);

  return {
    question,
    empty: trimmed.length === 0,
    emptyMessage: 'Hoy no hay movimiento registrado todavía.',
    insights: trimmed,
  };
}

export interface OportunidadesInput {
  rankingBoletas: BoletaRankingInput[];
  rankingProductos: ProductoRowInput[];
  productosCount: number;
  cuponesCount: number;
  tiposBoletaCount: number;
  reporte: ReporteEvento | null;
  stats: DashboardStats | null;
  aforo: IntelAforoTotals;
}

export function buildOportunidadesSection(input: OportunidadesInput): IntelOportunidadesSection {
  const items: IntelOportunidad[] = [];
  const conVentas = input.rankingBoletas.filter((r) => r.vendidas > 0);
  const totalBoletasVendidas = conVentas.reduce((s, r) => s + r.vendidas, 0);

  if (conVentas.length > 0 && totalBoletasVendidas > 0) {
    const top = conVentas[0];
    const pct = Math.round((top.vendidas / totalBoletasVendidas) * 100);
    if (pct >= 55) {
      items.push({
        text: `Tu "${top.nombre}" concentra el ${pct}% de las ventas. Refuerza su difusión o crea un tipo similar antes de que se agote.`,
      });
    }
  }

  if (input.rankingProductos.length > 0) {
    const top = input.rankingProductos[0];
    items.push({
      text: `"${top.nombre}" concentra lo que más pagaron tus clientes en productos. Destácalo en comunicación y en puerta.`,
    });
  } else if (input.productosCount === 0) {
    items.push({
      text: 'Aún no vendes productos adicionales. Agregar bebidas, merch o combos puede aumentar lo que recibirás por asistente sin depender solo de boletas.',
      ctaLabel: 'Agregar productos',
      ctaAction: 'productos',
      ctaVariant: 'secondary',
    });
  } else if (input.rankingProductos.length === 0 && input.productosCount > 0) {
    items.push({
      text: `Tienes ${input.productosCount} producto${input.productosCount === 1 ? '' : 's'} configurado${input.productosCount === 1 ? '' : 's'} sin ventas. Promociónalos en puerta cuando empiece el evento.`,
      ctaLabel: 'Ver catálogo',
      ctaAction: 'productos',
      ctaVariant: 'secondary',
    });
  }

  if (input.cuponesCount === 0) {
    items.push({
      text: 'Aún no has creado cupones. Un descuento por tiempo limitado puede impulsar ventas cuando el ritmo se enfríe.',
      ctaLabel: 'Crear cupones',
      ctaAction: 'cupones',
      ctaVariant: 'secondary',
    });
  }

  if (input.productosCount > 0 && input.productosCount < 4) {
    items.push({
      text: `Tu catálogo tiene ${input.productosCount} producto${input.productosCount === 1 ? '' : 's'}. Ampliarlo suele elevar el ticket promedio en puerta.`,
      ctaLabel: 'Ampliar catálogo',
      ctaAction: 'productos',
      ctaVariant: 'secondary',
    });
  }

  if (input.tiposBoletaCount === 1 && input.aforo.total > 0) {
    items.push({
      text: 'Solo tienes un tipo de boleta. Crear una opción VIP o palco puede aumentar tu ticket promedio sin tocar el aforo base.',
      ctaLabel: 'Crear tipo VIP',
      ctaAction: 'boletas',
      ctaVariant: 'secondary',
    });
  } else if (input.tiposBoletaCount >= 2 && conVentas.length >= 2) {
    const precioTop = conVentas[0].ingresosEst / Math.max(1, conVentas[0].vendidas);
    const precioSeg = conVentas[1].ingresosEst / Math.max(1, conVentas[1].vendidas);
    if (precioSeg < precioTop * 0.6) {
      items.push({
        text: 'Hay mucha diferencia entre tu boleta estrella y la segunda. Un combo o pack puede subir el ticket promedio de quien compra la opción económica.',
      });
    }
  }

  if (items.length === 0) {
    items.push({
      text: 'Tu operación va equilibrada. Sigue monitoreando ventas y aforo; ajusta precios o cupos si un tipo se agota antes de lo previsto.',
    });
  }

  const conclusion =
    items.length > 1
      ? 'Prioriza una acción a la vez. El impacto suele venir de reforzar lo que ya funciona, no de cambiar todo a la vez.'
      : 'Pequeños ajustes basados en datos suelen mover la aguja más que grandes cambios de último momento.';

  return {
    question: '¿Qué oportunidades tengo?',
    items: items.slice(0, 5),
    conclusion,
  };
}

/** Evita CTAs repetidos: solo actionNow lleva botón primario. */
export function applyIntelCtaPolicy(
  actionNow: IntelActionNow | null,
  sections: ({ ctaLabel?: string; ctaAction?: IntelCtaAction; ctaVariant?: IntelCtaVariant } | null)[],
  oportunidades: IntelOportunidadesSection | null = null,
): void {
  const primaryAction = actionNow?.ctaAction;
  const usedActions = new Set<IntelCtaAction>();
  if (primaryAction) {
    usedActions.add(primaryAction);
  }

  for (const section of sections) {
    if (!section?.ctaLabel || !section.ctaAction) {
      continue;
    }

    if (section.ctaAction === primaryAction || usedActions.has(section.ctaAction)) {
      section.ctaLabel = undefined;
      section.ctaAction = undefined;
      section.ctaVariant = undefined;
      continue;
    }

    section.ctaVariant = 'secondary';
    usedActions.add(section.ctaAction);
  }

  if (oportunidades) {
    oportunidades.items = oportunidades.items.map((item) => {
      if (!item.ctaAction || !item.ctaLabel) {
        return item;
      }
      if (item.ctaAction === primaryAction || usedActions.has(item.ctaAction)) {
        return { text: item.text };
      }
      usedActions.add(item.ctaAction);
      return { ...item, ctaVariant: 'secondary' as const };
    });
  }
}
