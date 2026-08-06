import { Evento, TipoEstadoEvento } from '../types';

/** Borrador nunca debe estar visible en catálogo. Activar catálogo implica publicado. */
export function enforceBorradorCatalogoRules(patch: Partial<Evento>): Partial<Evento> {
  const result = { ...patch };

  if (result.estado === TipoEstadoEvento.BORRADOR) {
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
