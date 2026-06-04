import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import {
  AvisoCupo,
  AvisoCupoConEvento,
  AvisoCupoMio,
  InteresCupo,
  ResumenMisCupos,
  TipoAvisoCupo,
} from '../types/cupos';

interface RpcOk {
  ok: boolean;
  error?: string;
  aviso_id?: number;
  interes_id?: number;
}

@Injectable({ providedIn: 'root' })
export class CuposEventoService {
  constructor(private supabase: SupabaseService) {}

  async resumenMisCupos(): Promise<ResumenMisCupos> {
    const { data, error } = await this.supabase.getClient().rpc('resumen_mis_cupos');
    if (error) throw error;
    const raw = (data ?? {}) as Record<string, unknown>;
    return {
      avisos_activos: Number(raw['avisos_activos'] ?? 0),
      total_respuestas: Number(raw['total_respuestas'] ?? 0),
    };
  }

  async listarMisAvisos(): Promise<AvisoCupoMio[]> {
    const { data, error } = await this.supabase.getClient().rpc('listar_mis_avisos_cupo');
    if (error) throw error;
    return this.normalizeJsonArray<AvisoCupoMio>(data);
  }

  async listarGlobal(
    tipo?: TipoAvisoCupo | null,
    limite = 80,
    offset = 0,
  ): Promise<AvisoCupoConEvento[]> {
    const { data, error } = await this.supabase.getClient().rpc('listar_avisos_cupo_global', {
      p_tipo: tipo ?? null,
      p_limite: limite,
      p_offset: offset,
    });
    if (error) throw error;
    return this.normalizeJsonArray<AvisoCupoConEvento>(data);
  }

  async listarPorEvento(eventoId: number, tipo?: TipoAvisoCupo | null): Promise<AvisoCupo[]> {
    const { data, error } = await this.supabase.getClient().rpc('listar_avisos_cupo_evento', {
      p_evento_id: eventoId,
      p_tipo: tipo ?? null,
    });
    if (error) throw error;
    return this.normalizeJsonArray<AvisoCupo>(data);
  }

  async crear(params: {
    eventoId: number;
    tipo: TipoAvisoCupo;
    descripcion: string;
    cupos: number;
    zonaTexto?: string;
    precioReferenciaCop?: number | null;
    boletaId?: number | null;
  }): Promise<number> {
    const { data, error } = await this.supabase.getClient().rpc('crear_aviso_cupo', {
      p_evento_id: params.eventoId,
      p_tipo: params.tipo,
      p_descripcion: params.descripcion,
      p_cupos: params.cupos,
      p_zona_texto: params.zonaTexto ?? null,
      p_precio_referencia_cop: params.precioReferenciaCop ?? null,
      p_boleta_id: params.boletaId ?? null,
    });
    if (error) throw error;
    const res = data as RpcOk;
    if (!res?.ok) throw new Error(res?.error || 'No se pudo publicar el aviso');
    return Number(res.aviso_id);
  }

  async registrarInteres(avisoId: number, mensaje: string): Promise<void> {
    const { data, error } = await this.supabase.getClient().rpc('registrar_interes_cupo', {
      p_aviso_id: avisoId,
      p_mensaje: mensaje,
    });
    if (error) throw error;
    const res = data as RpcOk;
    if (!res?.ok) throw new Error(res?.error || 'No se pudo enviar tu interés');
  }

  async cerrarAviso(avisoId: number): Promise<void> {
    const { data, error } = await this.supabase.getClient().rpc('cerrar_aviso_cupo', {
      p_aviso_id: avisoId,
    });
    if (error) throw error;
    const res = data as RpcOk;
    if (!res?.ok) throw new Error(res?.error || 'No se pudo cerrar el aviso');
  }

  async reportar(avisoId: number, motivo?: string): Promise<void> {
    const { data, error } = await this.supabase.getClient().rpc('reportar_aviso_cupo', {
      p_aviso_id: avisoId,
      p_motivo: motivo ?? null,
    });
    if (error) throw error;
    const res = data as RpcOk;
    if (!res?.ok) throw new Error(res?.error || 'No se pudo reportar');
  }

  async listarInteresesMiAviso(avisoId: number): Promise<InteresCupo[]> {
    const { data, error } = await this.supabase.getClient().rpc('listar_intereses_mi_aviso', {
      p_aviso_id: avisoId,
    });
    if (error) throw error;
    return this.normalizeJsonArray<InteresCupo>(data);
  }

  /** JSONB de PostgREST a veces llega como string; normalizar a array. */
  private normalizeJsonArray<T>(data: unknown): T[] {
    if (Array.isArray(data)) {
      return data as T[];
    }
    if (typeof data === 'string') {
      try {
        const parsed: unknown = JSON.parse(data);
        return Array.isArray(parsed) ? (parsed as T[]) : [];
      } catch {
        return [];
      }
    }
    return [];
  }
}
