import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { BoletaComprada } from '../types';

export type PermisoEscaneo = {
  id: number;
  evento_id: number;
  tipo_boleta_id: number;
  titulo_evento: string;
  nombre_tipo_boleta: string;
};

type RowDb = {
  id: number;
  evento_id: number;
  tipo_boleta_id: number;
  eventos: { titulo?: string } | { titulo?: string }[] | null;
  tipos_boleta: { nombre?: string } | { nombre?: string }[] | null;
};

function unwrapRel<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export function buildPermisoKey(eventoId: number, tipoBoletaId: number): string {
  return `${eventoId}:${tipoBoletaId}`;
}

@Injectable({ providedIn: 'root' })
export class LectorPermisosService {
  constructor(private supabase: SupabaseService) {}

  /** Permisos del lector autenticado (RLS: solo filas propias). */
  async fetchMisPermisosEscaneo(): Promise<PermisoEscaneo[]> {
    const { data, error } = await this.supabase
      .from('lector_evento_tipo_boleta')
      .select('id, evento_id, tipo_boleta_id, eventos(titulo), tipos_boleta(nombre)')
      .order('evento_id', { ascending: true });

    if (error) {
      console.error('fetchMisPermisosEscaneo:', error);
      throw error;
    }

    const rows = (data as RowDb[]) || [];
    return rows.map((r) => {
      const ev = unwrapRel(r.eventos);
      const tb = unwrapRel(r.tipos_boleta);
      return {
        id: r.id,
        evento_id: r.evento_id,
        tipo_boleta_id: r.tipo_boleta_id,
        titulo_evento: ev?.titulo || `Evento #${r.evento_id}`,
        nombre_tipo_boleta: tb?.nombre || `Tipo #${r.tipo_boleta_id}`,
      };
    });
  }

  /** Filtra boletas según evento + tipo asignados al lector. */
  async filtrarBoletasConPermisos(
    boletas: BoletaComprada[],
    permisoKeys: Set<string>
  ): Promise<BoletaComprada[]> {
    const filtradas: BoletaComprada[] = [];
    for (const boleta of boletas) {
      const { data: tipoBoleta, error } = await this.supabase
        .from('tipos_boleta')
        .select('evento_id')
        .eq('id', boleta.tipo_boleta_id)
        .single();
      if (error || !tipoBoleta) continue;
      const key = buildPermisoKey(tipoBoleta.evento_id, boleta.tipo_boleta_id);
      if (permisoKeys.has(key)) {
        filtradas.push(boleta);
      }
    }
    return filtradas;
  }
}
