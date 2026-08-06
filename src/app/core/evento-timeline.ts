import { Evento, TipoEstadoEvento } from '../types';
import { ReporteEvento } from '../services/reportes.service';

export type EventoTimelineKind =
  | 'created'
  | 'published'
  | 'first_sale'
  | 'started'
  | 'finished'
  | 'cancelled';

export interface EventoTimelineItem {
  id: EventoTimelineKind;
  label: string;
  description?: string;
  date?: Date | string | null;
  reached: boolean;
  current?: boolean;
}

function parseDate(value: Date | string | undefined | null): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function buildEventoTimeline(
  evento: Evento,
  reporte: ReporteEvento | null,
): EventoTimelineItem[] {
  const estado = (evento.estado as TipoEstadoEvento) ?? TipoEstadoEvento.BORRADOR;
  const boletasVendidas = reporte?.boletas_vendidas ?? 0;
  const isPublishedOrLater = [
    TipoEstadoEvento.PUBLICADO,
    TipoEstadoEvento.EN_CURSO,
    TipoEstadoEvento.FINALIZADO,
  ].includes(estado);
  const isLiveOrLater = [TipoEstadoEvento.EN_CURSO, TipoEstadoEvento.FINALIZADO].includes(estado);

  const items: EventoTimelineItem[] = [
    {
      id: 'created',
      label: 'Evento creado',
      date: evento.fecha_creacion ?? null,
      reached: true,
      current: estado === TipoEstadoEvento.BORRADOR && boletasVendidas === 0,
    },
    {
      id: 'published',
      label: 'Publicado en catálogo',
      date: isPublishedOrLater ? evento.fecha_actualizacion ?? null : null,
      reached: isPublishedOrLater,
      current: estado === TipoEstadoEvento.PUBLICADO,
    },
    {
      id: 'first_sale',
      label: 'Primera venta',
      description: boletasVendidas > 0 ? `${boletasVendidas} boleta${boletasVendidas === 1 ? '' : 's'} vendida${boletasVendidas === 1 ? '' : 's'}` : undefined,
      reached: boletasVendidas > 0,
      current: isPublishedOrLater && boletasVendidas === 0 && estado !== TipoEstadoEvento.CANCELADO,
    },
    {
      id: 'started',
      label: 'Evento iniciado',
      date: isLiveOrLater ? evento.fecha_inicio : null,
      reached: isLiveOrLater,
      current: estado === TipoEstadoEvento.EN_CURSO,
    },
    {
      id: 'finished',
      label: 'Evento finalizado',
      date: estado === TipoEstadoEvento.FINALIZADO ? evento.fecha_fin : null,
      reached: estado === TipoEstadoEvento.FINALIZADO,
      current: false,
    },
  ];

  if (estado === TipoEstadoEvento.CANCELADO) {
    items.push({
      id: 'cancelled',
      label: 'Evento cancelado',
      date: evento.fecha_actualizacion ?? null,
      reached: true,
      current: true,
    });
  }

  return items.filter((item) => {
    if (item.id === 'finished' && estado === TipoEstadoEvento.CANCELADO) {
      return false;
    }
    return true;
  });
}

export function formatTimelineDate(value: Date | string | null | undefined): string | null {
  const d = parseDate(value ?? null);
  if (!d) return null;
  return d.toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
