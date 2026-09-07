import { Evento, TipoEstadoEvento } from '../types';
import { DateTimeUtil } from '../utils/date-time.util';

/**
 * “En curso” operativo por fechas (como en catálogo cliente).
 * No es un estado editable: el evento sigue publicado/activo mientras no se finalice.
 */
export function isEventoEnCursoPorFechas(
  evento: Pick<Evento, 'fecha_inicio' | 'fecha_fin' | 'estado'> | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!evento?.fecha_inicio) return false;

  const estado = evento.estado as TipoEstadoEvento | string | undefined;
  if (
    estado === TipoEstadoEvento.BORRADOR ||
    estado === 'borrador' ||
    estado === TipoEstadoEvento.FINALIZADO ||
    estado === 'finalizado' ||
    estado === TipoEstadoEvento.CANCELADO ||
    estado === 'cancelado'
  ) {
    return false;
  }

  const inicio = evento.fecha_inicio instanceof Date
    ? evento.fecha_inicio
    : DateTimeUtil.parseStoredDate(evento.fecha_inicio);
  if (Number.isNaN(inicio.getTime()) || inicio.getTime() > now.getTime()) {
    return false;
  }

  if (evento.fecha_fin) {
    const fin = evento.fecha_fin instanceof Date
      ? evento.fecha_fin
      : DateTimeUtil.parseStoredDate(evento.fecha_fin);
    if (!Number.isNaN(fin.getTime()) && fin.getTime() <= now.getTime()) {
      return false;
    }
  }

  return true;
}

/** Estado para UI: deriva EN_CURSO por fechas si aplica. */
export function resolveEventoEstadoVisual(
  evento: Pick<Evento, 'fecha_inicio' | 'fecha_fin' | 'estado'> | null | undefined,
  now: Date = new Date(),
): TipoEstadoEvento {
  const estado = (evento?.estado as TipoEstadoEvento) ?? TipoEstadoEvento.BORRADOR;
  if (isEventoEnCursoPorFechas(evento, now)) {
    return TipoEstadoEvento.EN_CURSO;
  }
  if (estado === TipoEstadoEvento.EN_CURSO) {
    return TipoEstadoEvento.PUBLICADO;
  }
  return estado;
}
