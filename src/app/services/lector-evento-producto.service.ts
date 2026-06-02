import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { LectorEventoProducto } from '../types';

@Injectable({
  providedIn: 'root',
})
export class LectorEventoProductoService {
  private readonly table = 'lector_evento_producto';

  constructor(private supabase: SupabaseService) {}

  /**
   * Lista parametrizaciones de lector para productos según RLS.
   */
  async listar(): Promise<LectorEventoProducto[]> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select(
        'id, usuario_id, evento_id, fecha_creacion, usuarios (id, nombre, apellido, email), eventos (id, titulo)'
      )
      .order('fecha_creacion', { ascending: false })
      .limit(500);

    if (error) {
      console.error('Error listando lector_evento_producto:', error);
      throw error;
    }

    return (data as unknown as LectorEventoProducto[]) || [];
  }

  /**
   * Crea el permiso lector+evento para productos (idempotente).
   */
  async crearAsignacion(usuarioId: number, eventoId: number): Promise<void> {
    const { error } = await this.supabase.from(this.table).upsert(
      {
        usuario_id: usuarioId,
        evento_id: eventoId,
      },
      { onConflict: 'usuario_id,evento_id' }
    );

    if (error) {
      console.error('Error creando asignación lector_evento_producto:', error);
      throw error;
    }
  }

  async eliminar(id: number): Promise<void> {
    const { error } = await this.supabase.from(this.table).delete().eq('id', id);
    if (error) {
      console.error('Error eliminando lector_evento_producto:', error);
      throw error;
    }
  }
}
