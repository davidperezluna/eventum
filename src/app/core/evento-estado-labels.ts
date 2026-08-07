import { TipoEstadoEvento } from '../types';

/** Etiquetas admin (formularios, filtros, revisión). */
export const EVENTO_ESTADO_ADMIN_LABELS: Record<TipoEstadoEvento, string> = {
  [TipoEstadoEvento.BORRADOR]: 'Borrador',
  [TipoEstadoEvento.PUBLICADO]: 'Publicado',
  [TipoEstadoEvento.EN_CURSO]: 'En curso',
  [TipoEstadoEvento.FINALIZADO]: 'Finalizado',
  [TipoEstadoEvento.CANCELADO]: 'Cancelado',
};

/** Etiquetas en tarjeta — lo que ve el usuario en el listado. */
export const EVENTO_ESTADO_CARD_LABELS: Record<TipoEstadoEvento, string> = {
  [TipoEstadoEvento.BORRADOR]: 'Borrador',
  [TipoEstadoEvento.PUBLICADO]: 'Entradas disponibles',
  [TipoEstadoEvento.EN_CURSO]: 'En vivo',
  [TipoEstadoEvento.FINALIZADO]: 'Finalizado',
  [TipoEstadoEvento.CANCELADO]: 'Cancelado',
};

export function getEventoEstadoAdminLabel(estado?: TipoEstadoEvento | string | null): string {
  if (!estado) return 'Sin estado';
  const key = estado as TipoEstadoEvento;
  return EVENTO_ESTADO_ADMIN_LABELS[key] ?? String(estado);
}

export function getEventoEstadoCardLabel(estado?: TipoEstadoEvento | string | null): string {
  if (!estado) return 'Sin estado';
  const key = estado as TipoEstadoEvento;
  return EVENTO_ESTADO_CARD_LABELS[key] ?? getEventoEstadoAdminLabel(estado);
}

export function getEventoEstadoCardStatusClass(estado?: TipoEstadoEvento | string | null): string {
  switch (estado) {
    case TipoEstadoEvento.PUBLICADO:
    case 'publicado':
      return 'ev-evento-card__status-dot--published';
    case TipoEstadoEvento.EN_CURSO:
    case 'en_curso':
      return 'ev-evento-card__status-dot--live';
    case TipoEstadoEvento.FINALIZADO:
    case 'finalizado':
      return 'ev-evento-card__status-dot--done';
    case TipoEstadoEvento.CANCELADO:
    case 'cancelado':
      return 'ev-evento-card__status-dot--cancelled';
    default:
      return 'ev-evento-card__status-dot--draft';
  }
}
