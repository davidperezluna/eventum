import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { TrasladoBoleta } from '../types';

export interface RpcTrasladoResult {
  ok: boolean;
  error?: string;
  traslado_id?: number;
}

/** Normaliza la respuesta JSON de RPCs de traslado/asignación (PostgREST puede devolver variantes). */
export function parseRpcTrasladoResult(data: unknown): RpcTrasladoResult {
  let row: unknown = data;

  if (typeof row === 'string') {
    try {
      row = JSON.parse(row);
    } catch {
      return { ok: false, error: 'Respuesta inválida del servidor' };
    }
  }

  if (Array.isArray(row)) {
    row = row.length === 1 ? row[0] : row;
  }

  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return { ok: false, error: 'Respuesta inválida del servidor' };
  }

  const r = row as Record<string, unknown>;
  const okRaw = r['ok'];
  const errorText = typeof r['error'] === 'string' ? r['error'] : undefined;

  const isSuccess = okRaw === true || okRaw === 'true' || okRaw === 1 || okRaw === '1';
  const isFailure =
    okRaw === false ||
    okRaw === 'false' ||
    okRaw === 0 ||
    okRaw === '0' ||
    (!isSuccess && !!errorText);

  if (isFailure) {
    return { ok: false, error: errorText || 'Error desconocido' };
  }

  if (isSuccess) {
    const tid = r['traslado_id'];
    const traslado_id =
      typeof tid === 'number'
        ? tid
        : typeof tid === 'string' && tid.trim() !== ''
          ? Number(tid)
          : undefined;
    return { ok: true, traslado_id: Number.isFinite(traslado_id) ? traslado_id : undefined };
  }

  return { ok: false, error: errorText || 'Respuesta inválida del servidor' };
}

@Injectable({ providedIn: 'root' })
export class TrasladosBoletaService {
  constructor(private supabase: SupabaseService) {}

  /**
   * Trazabilidad: traslados donde el usuario es origen o destino.
   */
  async listarMiTrazabilidad(): Promise<TrasladoBoleta[]> {
    const { data, error } = await this.supabase
      .from('traslados_boleta')
      .select(
        `
        *,
        usuario_origen:usuarios!usuario_origen_id(id,email,nombre,apellido),
        usuario_destino:usuarios!usuario_destino_id(id,email,nombre,apellido),
        boleta:boletas_compradas!boleta_id(
          id,
          tipo_boleta_id,
          tipos_boleta(
            nombre,
            eventos(titulo)
          )
        )
      `
      )
      .order('fecha_creacion', { ascending: false });

    if (error) {
      console.error('listarMiTrazabilidad:', error);
      throw error;
    }
    return (data as TrasladoBoleta[]) || [];
  }

  async rellenarAsistentePalcoDesdePerfil(boletaId: number): Promise<RpcTrasladoResult> {
    const { data, error } = await this.supabase.getClient().rpc('rellenar_asistente_palco_desde_perfil', {
      p_boleta_id: boletaId
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    return parseRpcTrasladoResult(data);
  }

  async iniciarTrasladoPalco(boletaId: number, emailDestino: string): Promise<RpcTrasladoResult> {
    const { data, error } = await this.supabase.getClient().rpc('iniciar_traslado_boleta_palco', {
      p_boleta_id: boletaId,
      p_email_destino: emailDestino.trim()
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    return parseRpcTrasladoResult(data);
  }

  async marcarRecibido(trasladoId: number): Promise<RpcTrasladoResult> {
    const { data, error } = await this.supabase.getClient().rpc('marcar_traslado_boleta_recibido', {
      p_traslado_id: trasladoId
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    return parseRpcTrasladoResult(data);
  }

  async aceptar(trasladoId: number): Promise<RpcTrasladoResult> {
    const { data, error } = await this.supabase.getClient().rpc('aceptar_traslado_boleta_palco', {
      p_traslado_id: trasladoId
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    return parseRpcTrasladoResult(data);
  }

  async rechazar(trasladoId: number): Promise<RpcTrasladoResult> {
    const { data, error } = await this.supabase.getClient().rpc('rechazar_traslado_boleta_palco', {
      p_traslado_id: trasladoId
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    return parseRpcTrasladoResult(data);
  }

  async cancelar(trasladoId: number): Promise<RpcTrasladoResult> {
    const { data, error } = await this.supabase.getClient().rpc('cancelar_traslado_boleta_palco', {
      p_traslado_id: trasladoId
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    return parseRpcTrasladoResult(data);
  }
}
