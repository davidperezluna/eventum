import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { BoletaComprada } from '../types';

export type PermisoEscaneo = {
  id: number;
  evento_id: number;
  tipo_boleta_id: number | null;
  titulo_evento: string;
  nombre_tipo_boleta: string;
  categoria: 'boleta' | 'producto';
};

type RowDb = {
  id: number;
  evento_id: number;
  tipo_boleta_id: number | string | null;
};

export function buildPermisoKey(eventoId: number, tipoBoletaId: number): string {
  return `${eventoId}:${tipoBoletaId}`;
}

@Injectable({ providedIn: 'root' })
export class LectorPermisosService {
  constructor(private supabase: SupabaseService) {}

  private normalizarTipoBoletaId(raw: number | string | null | undefined): number | null {
    if (raw == null) {
      return null;
    }
    if (typeof raw === 'string') {
      const clean = raw.trim().toLowerCase();
      if (!clean || clean === 'null' || clean === 'undefined') {
        return null;
      }
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    return parsed;
  }

  /** Permisos del lector autenticado (RLS: solo filas propias). */
  async fetchMisPermisosEscaneo(): Promise<PermisoEscaneo[]> {
    const { data, error } = await this.supabase
      .from('lector_evento_tipo_boleta')
      .select('id, evento_id, tipo_boleta_id')
      .order('evento_id', { ascending: true });

    if (error) {
      console.error('fetchMisPermisosEscaneo:', error);
      throw error;
    }

    const rows = (data as RowDb[]) || [];
    const eventoIds = [...new Set(rows.map((r) => r.evento_id).filter((id) => id != null))];
    const filasNormalizadas = rows.map((r) => ({
      id: Number(r.id || 0),
      evento_id: Number(r.evento_id),
      tipo_boleta_id: this.normalizarTipoBoletaId(r.tipo_boleta_id),
    }));

    const tipoIds = [
      ...new Set(
        filasNormalizadas
          .map((r) => r.tipo_boleta_id)
          .filter((id): id is number => typeof id === 'number')
      ),
    ];

    const nombresEvento = new Map<number, string>();
    const nombresTipo = new Map<number, string>();

    // Enriquecimiento opcional: si RLS no permite leer estos catálogos,
    // seguimos con fallback por ID sin romper la pantalla del lector.
    if (eventoIds.length > 0) {
      const { data: eventosData, error: eventosError } = await this.supabase
        .from('eventos')
        .select('id, titulo')
        .in('id', eventoIds);
      if (!eventosError && Array.isArray(eventosData)) {
        for (const ev of eventosData as Array<{ id: number; titulo?: string }>) {
          if (typeof ev.id === 'number' && ev.titulo) {
            nombresEvento.set(ev.id, ev.titulo);
          }
        }
      }
    }

    if (tipoIds.length > 0) {
      const { data: tiposData, error: tiposError } = await this.supabase
        .from('tipos_boleta')
        .select('id, nombre')
        .in('id', tipoIds);
      if (!tiposError && Array.isArray(tiposData)) {
        for (const tb of tiposData as Array<{ id: number; nombre?: string }>) {
          if (typeof tb.id === 'number' && tb.nombre) {
            nombresTipo.set(tb.id, tb.nombre);
          }
        }
      }
    }

    return filasNormalizadas
      .map((r) => {
        const eventoId = Number(r.evento_id);
        if (!Number.isFinite(eventoId) || eventoId <= 0) {
          return null;
        }

        const esProducto = r.tipo_boleta_id == null;
        const tipoId = esProducto ? null : r.tipo_boleta_id;
        const tipoValido = typeof tipoId === 'number' && Number.isFinite(tipoId) && tipoId > 0;

        return {
          id: r.id,
          evento_id: eventoId,
          tipo_boleta_id: esProducto ? null : (tipoValido ? tipoId : null),
          titulo_evento: nombresEvento.get(eventoId) || `Evento ${eventoId}`,
          nombre_tipo_boleta: esProducto
            ? 'Productos del evento'
            : (tipoValido ? (nombresTipo.get(tipoId!) || `Tipo ${tipoId}`) : 'Tipo de boleta'),
          categoria: esProducto ? ('producto' as const) : ('boleta' as const),
        };
      })
      .filter((p): p is PermisoEscaneo => p !== null);
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
