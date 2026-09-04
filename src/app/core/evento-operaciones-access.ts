import { Evento, TipoEstadoEvento } from '../types';

/**
 * El organizador no puede abrir Operaciones si el evento está finalizado o liquidado.
 * Admin (y otros roles) sí pueden.
 */
export function canOrganizadorOpenOperaciones(
  evento: Pick<Evento, 'estado' | 'liquidado'> | null | undefined,
  isOrganizador: boolean,
): boolean {
  if (!isOrganizador) return true;
  if (!evento) return true;
  if (evento.liquidado === true) return false;
  const estado = evento.estado as TipoEstadoEvento | string | undefined;
  if (estado === TipoEstadoEvento.FINALIZADO || estado === 'finalizado') return false;
  return true;
}

export function organizadorOperacionesBlockedMessage(
  evento: Pick<Evento, 'estado' | 'liquidado'> | null | undefined,
): { title: string; message: string } {
  if (evento?.liquidado === true) {
    return {
      title: 'Evento liquidado',
      message: 'Este evento ya fue liquidado. Solo puedes consultar Inteligencia.',
    };
  }
  return {
    title: 'Evento finalizado',
    message: 'Este evento ya finalizó. Solo puedes consultar Inteligencia.',
  };
}

export function organizadorOperacionesBlockedShortLabel(
  evento: Pick<Evento, 'estado' | 'liquidado'> | null | undefined,
): string {
  if (evento?.liquidado === true) return 'liquidado';
  return 'finalizado';
}
