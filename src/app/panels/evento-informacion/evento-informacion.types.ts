import { Evento } from '../../types';

export interface EventoInformacionPanelData {
  eventoId: number;
  eventoTitulo: string;
  titulo: string;
  categoria_id?: number | null;
  tags?: string | null;
  descripcion_corta?: string | null;
  descripcion?: string | null;
}

export interface EventoInformacionDrawerResult {
  changed: boolean;
  titulo?: string;
  categoria_id?: number | null;
  tags?: string | null;
  descripcion_corta?: string | null;
  descripcion?: string | null;
}

export interface InformacionFormSnapshot {
  titulo: string;
  categoria_id: number | null;
  tags: string;
  descripcion_corta: string;
  descripcion: string;
}

export function isInformacionComplete(
  snapshot: Pick<InformacionFormSnapshot, 'titulo' | 'categoria_id' | 'descripcion_corta' | 'descripcion'>,
): boolean {
  return !!(
    snapshot.titulo.trim() &&
    snapshot.categoria_id &&
    (snapshot.descripcion_corta.trim() || snapshot.descripcion.trim())
  );
}

export type EventoInformacionSource = Pick<
  Evento,
  'id' | 'titulo' | 'categoria_id' | 'tags' | 'descripcion_corta' | 'descripcion'
>;
