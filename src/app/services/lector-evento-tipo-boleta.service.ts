import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { LectorEventoTipoBoleta } from '../types';

@Injectable({
  providedIn: 'root',
})
export class LectorEventoTipoBoletaService {
  private readonly table = 'lector_evento_tipo_boleta';

  constructor(private supabase: SupabaseService) {}

  /**
   * Lista todas las parametrizaciones visibles según RLS (admin: todas; organizador: sus eventos).
   */
  async listar(): Promise<LectorEventoTipoBoleta[]> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select(
        'id, usuario_id, evento_id, tipo_boleta_id, fecha_creacion, usuarios (id, nombre, apellido, email), eventos (id, titulo), tipos_boleta (id, nombre, evento_id)'
      )
      .order('fecha_creacion', { ascending: false })
      .limit(500);

    if (error) {
      console.error('Error listando lector_evento_tipo_boleta:', error);
      throw error;
    }

    return (data as unknown as LectorEventoTipoBoleta[]) || [];
  }

  /**
   * Inserta combinaciones usuario + evento + tipo de boleta (omite las que ya existen).
   */
  async crearAsignaciones(
    usuarioId: number,
    eventoId: number,
    tipoBoletaIds: number[]
  ): Promise<void> {
    if (!tipoBoletaIds.length) {
      return;
    }

    const { data: existentes, error: errSel } = await this.supabase
      .from(this.table)
      .select('tipo_boleta_id')
      .eq('usuario_id', usuarioId)
      .eq('evento_id', eventoId)
      .in('tipo_boleta_id', tipoBoletaIds);

    if (errSel) {
      console.error('Error comprobando asignaciones existentes:', errSel);
      throw errSel;
    }

    const ya = new Set((existentes || []).map((r: { tipo_boleta_id: number }) => r.tipo_boleta_id));
    const nuevos = tipoBoletaIds.filter((id) => !ya.has(id));
    if (!nuevos.length) {
      return;
    }

    const rows = nuevos.map((tipo_boleta_id) => ({
      usuario_id: usuarioId,
      evento_id: eventoId,
      tipo_boleta_id,
    }));

    const { error } = await this.supabase.from(this.table).insert(rows);

    if (error) {
      console.error('Error creando asignaciones lector:', error);
      throw error;
    }
  }

  /**
   * Crea (si no existe) el permiso de productos por evento usando la misma tabla
   * con `tipo_boleta_id = null`.
   */
  async crearAsignacionProductos(usuarioId: number, eventoId: number): Promise<void> {
    const { data: existente, error: errSel } = await this.supabase
      .from(this.table)
      .select('id')
      .eq('usuario_id', usuarioId)
      .eq('evento_id', eventoId)
      .is('tipo_boleta_id', null)
      .maybeSingle();

    if (errSel) {
      console.error('Error comprobando asignación de productos existente:', errSel);
      throw errSel;
    }
    if (existente) {
      return;
    }

    const { error } = await this.supabase.from(this.table).insert({
      usuario_id: usuarioId,
      evento_id: eventoId,
      tipo_boleta_id: null,
    });

    if (error) {
      console.error('Error creando asignación lector (productos):', error);
      throw error;
    }
  }

  async eliminar(id: number): Promise<void> {
    const { error } = await this.supabase.from(this.table).delete().eq('id', id);
    if (error) {
      console.error('Error eliminando lector_evento_tipo_boleta:', error);
      throw error;
    }
  }
}
