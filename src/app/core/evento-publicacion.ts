import { Evento, TipoEstadoEvento } from '../types';

/** Borrador/finalizado/cancelado nunca deben estar visibles en catálogo. Activar catálogo implica publicado. */
export function enforceBorradorCatalogoRules(patch: Partial<Evento>): Partial<Evento> {
  const result = { ...patch };

  if (
    result.estado === TipoEstadoEvento.BORRADOR ||
    result.estado === TipoEstadoEvento.FINALIZADO ||
    result.estado === TipoEstadoEvento.CANCELADO
  ) {
    result.activo = false;
  }

  if (result.activo === true) {
    result.estado = TipoEstadoEvento.PUBLICADO;
  }

  return result;
}

export function isEventoCatalogoInconsistent(
  evento: Pick<Evento, 'estado' | 'activo'>,
): boolean {
  return evento.activo === true && evento.estado === TipoEstadoEvento.BORRADOR;
}

export function patchPublicadoEnCatalogo(): Pick<Evento, 'estado' | 'activo'> {
  return {
    estado: TipoEstadoEvento.PUBLICADO,
    activo: true,
  };
}

export function patchFueraDeCatalogo(): Pick<Evento, 'activo'> {
  return { activo: false };
}

export function patchBorrador(): Pick<Evento, 'estado' | 'activo'> {
  return {
    estado: TipoEstadoEvento.BORRADOR,
    activo: false,
  };
}

/** Cierre operativo: fuera de catálogo (misma regla que el job automático por fecha_fin). */
export function patchFinalizado(): Pick<Evento, 'estado' | 'activo'> {
  return {
    estado: TipoEstadoEvento.FINALIZADO,
    activo: false,
  };
}

export function patchCancelado(): Pick<Evento, 'estado' | 'activo'> {
  return {
    estado: TipoEstadoEvento.CANCELADO,
    activo: false,
  };
}
