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

/** Normaliza el JSONB[] devuelto por RPCs listar_traslados_boleta_* */
export function parseTrasladosJsonArray(data: unknown): TrasladoBoleta[] {
  let raw: unknown = data;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((row) => {
    const t = row as TrasladoBoleta & {
      usuario_origen_email?: string;
      usuario_origen_nombre?: string;
      usuario_origen_apellido?: string;
    };
    if (t.usuario_origen_email && !t.usuario_origen) {
      t.usuario_origen = {
        id: Number(t.usuario_origen_id),
        email: t.usuario_origen_email,
        nombre: t.usuario_origen_nombre,
        apellido: t.usuario_origen_apellido,
      };
    }
    return t;
  });
}

const TRASLADO_BOLETA_SELECT = `
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
  ),
  boleta_cover:boletas_cover!boleta_cover_id(
    id,
    codigo_qr,
    tipo_cover_id,
    tipos_cover(nombre),
    sesiones_cover(
      fecha,
      lugares(nombre)
    )
  )
`;

@Injectable({ providedIn: 'root' })
export class TrasladosBoletaService {
  constructor(private supabase: SupabaseService) {}

  /**
   * Trazabilidad: traslados donde el usuario es origen o destino.
   */
  async listarMiTrazabilidad(usuarioId?: number): Promise<TrasladoBoleta[]> {
    const { data, error } = await this.supabase.getClient().rpc('listar_traslados_boleta_trazabilidad', {
      p_cliente_id: usuarioId != null && usuarioId > 0 ? usuarioId : null,
    });

    if (error) {
      console.error('listarMiTrazabilidad:', error);
      throw error;
    }
    return parseTrasladosJsonArray(data);
  }

  /** Traslados enviados por el usuario que siguen pendientes (enviado/recibido). */
  async listarTrasladosSalientes(usuarioId: number): Promise<TrasladoBoleta[]> {
    const { data, error } = await this.supabase.getClient().rpc('listar_traslados_boleta_salientes', {
      p_cliente_id: usuarioId,
    });

    if (error) {
      console.error('listarTrasladosSalientes:', error);
      throw error;
    }
    return parseTrasladosJsonArray(data);
  }

  /** Traslados pendientes de aceptar/rechazar para el destinatario. */
  async listarPendientesRecibir(usuarioId: number): Promise<TrasladoBoleta[]> {
    const { data, error } = await this.supabase.getClient().rpc('listar_traslados_boleta_pendientes_recibir', {
      p_cliente_id: usuarioId,
    });

    if (error) {
      console.error('listarPendientesRecibir:', error);
      throw error;
    }
    return parseTrasladosJsonArray(data);
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

  async iniciarTrasladoCover(boletaCoverId: number, emailDestino: string): Promise<RpcTrasladoResult> {
    const { data, error } = await this.supabase.getClient().rpc('iniciar_traslado_boleta_cover', {
      p_boleta_cover_id: boletaCoverId,
      p_email_destino: emailDestino.trim(),
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    return parseRpcTrasladoResult(data);
  }

  async marcarRecibidoCover(trasladoId: number): Promise<RpcTrasladoResult> {
    const { data, error } = await this.supabase.getClient().rpc('marcar_traslado_boleta_cover_recibido', {
      p_traslado_id: trasladoId,
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    return parseRpcTrasladoResult(data);
  }

  async aceptarCover(trasladoId: number): Promise<RpcTrasladoResult> {
    const { data, error } = await this.supabase.getClient().rpc('aceptar_traslado_boleta_cover', {
      p_traslado_id: trasladoId,
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    return parseRpcTrasladoResult(data);
  }

  async rechazarCover(trasladoId: number): Promise<RpcTrasladoResult> {
    const { data, error } = await this.supabase.getClient().rpc('rechazar_traslado_boleta_cover', {
      p_traslado_id: trasladoId,
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    return parseRpcTrasladoResult(data);
  }

  async cancelarCover(trasladoId: number): Promise<RpcTrasladoResult> {
    const { data, error } = await this.supabase.getClient().rpc('cancelar_traslado_boleta_cover', {
      p_traslado_id: trasladoId,
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    return parseRpcTrasladoResult(data);
  }
}
