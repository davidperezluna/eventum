import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { TrasladoBoleta } from '../types';

export interface RpcTrasladoResult {
  ok: boolean;
  error?: string;
  traslado_id?: number;
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
    const row = data as RpcTrasladoResult | null;
    if (row && typeof row === 'object' && 'ok' in row) {
      return row as RpcTrasladoResult;
    }
    return { ok: false, error: 'Respuesta inválida del servidor' };
  }

  async iniciarTrasladoPalco(boletaId: number, emailDestino: string): Promise<RpcTrasladoResult> {
    const { data, error } = await this.supabase.getClient().rpc('iniciar_traslado_boleta_palco', {
      p_boleta_id: boletaId,
      p_email_destino: emailDestino.trim()
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    const row = data as RpcTrasladoResult | null;
    if (row && typeof row === 'object' && 'ok' in row) {
      return row as RpcTrasladoResult;
    }
    return { ok: false, error: 'Respuesta inválida del servidor' };
  }

  async marcarRecibido(trasladoId: number): Promise<RpcTrasladoResult> {
    const { data, error } = await this.supabase.getClient().rpc('marcar_traslado_boleta_recibido', {
      p_traslado_id: trasladoId
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    return (data as RpcTrasladoResult) || { ok: false };
  }

  async aceptar(trasladoId: number): Promise<RpcTrasladoResult> {
    const { data, error } = await this.supabase.getClient().rpc('aceptar_traslado_boleta_palco', {
      p_traslado_id: trasladoId
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    return (data as RpcTrasladoResult) || { ok: false };
  }

  async rechazar(trasladoId: number): Promise<RpcTrasladoResult> {
    const { data, error } = await this.supabase.getClient().rpc('rechazar_traslado_boleta_palco', {
      p_traslado_id: trasladoId
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    return (data as RpcTrasladoResult) || { ok: false };
  }

  async cancelar(trasladoId: number): Promise<RpcTrasladoResult> {
    const { data, error } = await this.supabase.getClient().rpc('cancelar_traslado_boleta_palco', {
      p_traslado_id: trasladoId
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    return (data as RpcTrasladoResult) || { ok: false };
  }
}
