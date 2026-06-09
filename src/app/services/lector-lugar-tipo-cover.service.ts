import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { LectorLugarTipoCover } from '../types';

@Injectable({ providedIn: 'root' })
export class LectorLugarTipoCoverService {
  private readonly table = 'lector_lugar_tipo_cover';

  constructor(private supabase: SupabaseService) {}

  async listar(): Promise<LectorLugarTipoCover[]> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select(
        'id, usuario_id, lugar_id, tipo_cover_id, fecha_creacion, usuarios (id, nombre, apellido, email), lugares (id, nombre, ciudad), tipos_cover (id, nombre, lugar_id)',
      )
      .order('fecha_creacion', { ascending: false })
      .limit(500);

    if (error) {
      console.error('Error listando lector_lugar_tipo_cover:', error);
      throw error;
    }

    return (data as unknown as LectorLugarTipoCover[]) || [];
  }

  async crearAsignaciones(
    usuarioId: number,
    lugarId: number,
    tipoCoverIds: number[],
  ): Promise<void> {
    if (!tipoCoverIds.length) return;

    const { data: existentes, error: errSel } = await this.supabase
      .from(this.table)
      .select('tipo_cover_id')
      .eq('usuario_id', usuarioId)
      .eq('lugar_id', lugarId)
      .in('tipo_cover_id', tipoCoverIds);

    if (errSel) {
      console.error('Error comprobando asignaciones cover existentes:', errSel);
      throw errSel;
    }

    const ya = new Set((existentes || []).map((r: { tipo_cover_id: number }) => r.tipo_cover_id));
    const nuevos = tipoCoverIds.filter((id) => !ya.has(id));
    if (!nuevos.length) return;

    const rows = nuevos.map((tipo_cover_id) => ({
      usuario_id: usuarioId,
      lugar_id: lugarId,
      tipo_cover_id,
    }));

    const { error } = await this.supabase.from(this.table).insert(rows);
    if (error) {
      console.error('Error creando asignaciones lector cover:', error);
      throw error;
    }
  }

  async eliminar(id: number): Promise<void> {
    const { error } = await this.supabase.from(this.table).delete().eq('id', id);
    if (error) {
      console.error('Error eliminando lector_lugar_tipo_cover:', error);
      throw error;
    }
  }
}
