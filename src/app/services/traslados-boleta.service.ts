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
  return raw.map((row) => aplicarEmailsParticipantesTraslado(row as TrasladoBoleta));
}

function tieneEmailOrigenTraslado(t: TrasladoBoleta): boolean {
  return !!(t.usuario_origen?.email?.trim() || t.usuario_origen_email?.trim());
}

function aplicarEmailsParticipantesTraslado(t: TrasladoBoleta): TrasladoBoleta {
  if (t.usuario_origen_email && !t.usuario_origen) {
    t.usuario_origen = {
      id: Number(t.usuario_origen_id),
      email: t.usuario_origen_email ?? undefined,
      nombre: t.usuario_origen_nombre ?? undefined,
      apellido: t.usuario_origen_apellido ?? undefined,
    };
  }
  if (t.usuario_destino_email && !t.usuario_destino) {
    t.usuario_destino = {
      id: Number(t.usuario_destino_id),
      email: t.usuario_destino_email ?? undefined,
    };
  }
  return t;
}

interface UsuarioTrasladoResumen {
  id: number;
  email?: string | null;
  nombre?: string | null;
  apellido?: string | null;
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
  async listarMiTrazabilidad(
    usuarioId?: number,
    perfilActual?: Pick<UsuarioTrasladoResumen, 'id' | 'email' | 'nombre' | 'apellido'> | null
  ): Promise<TrasladoBoleta[]> {
    const { data, error } = await this.supabase.getClient().rpc('listar_traslados_boleta_trazabilidad', {
      p_cliente_id: usuarioId != null && usuarioId > 0 ? usuarioId : null,
    });

    if (error) {
      console.error('listarMiTrazabilidad:', error);
      throw error;
    }
    const traslados = parseTrasladosJsonArray(data);
    return this.enriquecerEmailsParticipantes(traslados, perfilActual ?? undefined);
  }

  /** Completa origen/destino cuando el RPC no trae joins de usuarios. */
  async enriquecerEmailsParticipantes(
    traslados: TrasladoBoleta[],
    perfilActual?: Pick<UsuarioTrasladoResumen, 'id' | 'email' | 'nombre' | 'apellido'>
  ): Promise<TrasladoBoleta[]> {
    if (traslados.length === 0) {
      return traslados;
    }

    const usuariosPorId = new Map<number, UsuarioTrasladoResumen>();
    if (perfilActual?.id && perfilActual.email?.trim()) {
      usuariosPorId.set(Number(perfilActual.id), perfilActual);
    }

    const idsPendientes = [
      ...new Set(
        traslados.flatMap((t) => {
          const ids: number[] = [];
          const origenId = Number(t.usuario_origen_id ?? 0);
          const destinoId = Number(t.usuario_destino_id ?? 0);
          if (origenId > 0 && !tieneEmailOrigenTraslado(t) && !usuariosPorId.has(origenId)) {
            ids.push(origenId);
          }
          if (
            destinoId > 0 &&
            !t.usuario_destino?.email?.trim() &&
            !t.usuario_destino_email?.trim() &&
            !t.email_destino?.trim() &&
            !usuariosPorId.has(destinoId)
          ) {
            ids.push(destinoId);
          }
          return ids;
        })
      ),
    ];

    if (idsPendientes.length > 0) {
      await this.cargarUsuariosTraslados(idsPendientes, usuariosPorId);
    }

    return traslados.map((t) => {
      const enriched = { ...t };
      const origenId = Number(t.usuario_origen_id ?? 0);
      if (origenId > 0 && !tieneEmailOrigenTraslado(enriched)) {
        const u = usuariosPorId.get(origenId);
        if (u?.email?.trim()) {
          enriched.usuario_origen_email = u.email.trim();
          enriched.usuario_origen_nombre = u.nombre ?? enriched.usuario_origen_nombre;
          enriched.usuario_origen_apellido = u.apellido ?? enriched.usuario_origen_apellido;
          enriched.usuario_origen = {
            id: origenId,
            email: u.email.trim(),
            nombre: u.nombre ?? undefined,
            apellido: u.apellido ?? undefined,
          };
        }
      }

      const destinoId = Number(t.usuario_destino_id ?? 0);
      if (
        destinoId > 0 &&
        !enriched.usuario_destino?.email?.trim() &&
        !enriched.usuario_destino_email?.trim() &&
        !enriched.email_destino?.trim()
      ) {
        const u = usuariosPorId.get(destinoId);
        if (u?.email?.trim()) {
          enriched.usuario_destino_email = u.email.trim();
          enriched.usuario_destino = {
            id: destinoId,
            email: u.email.trim(),
            nombre: u.nombre ?? undefined,
            apellido: u.apellido ?? undefined,
          };
        }
      }

      return enriched;
    });
  }

  private async cargarUsuariosTraslados(
    ids: number[],
    destino: Map<number, UsuarioTrasladoResumen>
  ): Promise<void> {
    const faltantes = ids.filter((id) => !destino.has(id));
    if (faltantes.length === 0) {
      return;
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('usuarios')
      .select('id, email, nombre, apellido')
      .in('id', faltantes);

    if (!error && Array.isArray(data)) {
      data.forEach((u) => {
        if (u?.id) {
          destino.set(Number(u.id), u as UsuarioTrasladoResumen);
        }
      });
    }

    const aunFaltantes = faltantes.filter((id) => !destino.get(id)?.email?.trim());
    if (aunFaltantes.length === 0) {
      return;
    }

    try {
      const { data: rpcData, error: rpcError } = await this.supabase.getClient().rpc(
        'obtener_datos_usuarios_para_traslados',
        { p_usuario_ids: aunFaltantes }
      );
      if (rpcError) {
        return;
      }
      let parsed: UsuarioTrasladoResumen[] = [];
      if (Array.isArray(rpcData)) {
        parsed = rpcData as UsuarioTrasladoResumen[];
      } else if (typeof rpcData === 'string') {
        try {
          parsed = JSON.parse(rpcData) as UsuarioTrasladoResumen[];
        } catch {
          parsed = [];
        }
      }
      parsed.forEach((u) => {
        if (u?.id && u.email?.trim()) {
          destino.set(Number(u.id), u);
        }
      });
    } catch {
      /* ignorar */
    }
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
