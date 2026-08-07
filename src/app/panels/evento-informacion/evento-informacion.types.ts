import { Evento, Lugar } from '../../types';

export interface EventoInformacionPanelData {
  eventoId: number;
  eventoTitulo: string;
  titulo: string;
  categoria_id?: number | null;
  lugar_id?: number | null;
  tags?: string | null;
  descripcion_corta?: string | null;
  descripcion?: string | null;
  url_video?: string | null;
  terminos_condiciones?: string | null;
  politica_reembolso?: string | null;
  lugar?: Pick<Lugar, 'id' | 'nombre' | 'ciudad'> | null;
}

export interface EventoInformacionDrawerResult {
  changed: boolean;
  titulo?: string;
  categoria_id?: number | null;
  lugar_id?: number | null;
  tags?: string | null;
  descripcion_corta?: string | null;
  descripcion?: string | null;
  url_video?: string | null;
  terminos_condiciones?: string | null;
  politica_reembolso?: string | null;
  lugar?: Pick<Lugar, 'id' | 'nombre' | 'ciudad'> | null;
}

export interface InformacionFormSnapshot {
  titulo: string;
  categoria_id: number | null;
  lugar_id: number | null;
  tags: string;
  descripcion_corta: string;
  descripcion: string;
  url_video: string;
  terminos_condiciones: string;
  politica_reembolso: string;
}

export function isInformacionComplete(
  snapshot: Pick<
    InformacionFormSnapshot,
    'titulo' | 'categoria_id' | 'lugar_id' | 'descripcion_corta' | 'descripcion'
  >,
): boolean {
  return !!(
    snapshot.titulo.trim() &&
    snapshot.categoria_id &&
    snapshot.lugar_id &&
    (snapshot.descripcion_corta.trim() || snapshot.descripcion.trim())
  );
}

export type EventoInformacionSource = Pick<
  Evento,
  | 'id'
  | 'titulo'
  | 'categoria_id'
  | 'lugar_id'
  | 'tags'
  | 'descripcion_corta'
  | 'descripcion'
  | 'url_video'
  | 'terminos_condiciones'
  | 'politica_reembolso'
  | 'lugar'
>;
