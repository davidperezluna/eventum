/* ============================================
   PALCOS SERVICE
   ============================================ */

import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { TimezoneService } from './timezone.service';
import { BaseFilters, EstadoPalco, PaginatedResponse, Palco } from '../types';

export interface PalcosFilters extends BaseFilters {
  tipo_boleta_id?: number;
  estado?: EstadoPalco | string;
}

@Injectable({
  providedIn: 'root'
})
export class PalcosService {
  constructor(
    private supabase: SupabaseService,
    private timezoneService: TimezoneService
  ) {}

  /**
   * Lista palcos numerados con filtros opcionales.
   */
  async getPalcos(filters?: PalcosFilters): Promise<PaginatedResponse<Palco>> {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 10;
    const search = (filters?.search ?? '').trim();

    let query = this.supabase
      .from('palcos')
      .select('*, tipos_boleta(id, nombre, es_palco, activo)', { count: 'exact' });

    if (filters?.tipo_boleta_id !== undefined && filters?.tipo_boleta_id !== null) {
      query = query.eq('tipo_boleta_id', filters.tipo_boleta_id);
    }

    if (filters?.estado) {
      query = query.eq('estado', filters.estado);
    }

    // Búsqueda por número de palco (si es numérica usamos eq; si no, intentamos ilike)
    if (search) {
      const n = Number(search);
      if (!isNaN(n)) {
        query = query.eq('numero', n);
      } else {
        // Nota: `numero` es numérico en la DB, pero Supabase/PG suele permitir cast implícito.
        // Si falla, al menos no rompe la UI: el backend retornará error y se verá en consola.
        query = query.ilike('numero', `%${search}%`);
      }
    }

    query = query.order('numero', { ascending: true });

    const fromIndex = (page - 1) * limit;
    const toIndex = fromIndex + limit - 1;
    query = query.range(fromIndex, toIndex);

    const { data, error, count } = await query;
    if (error) {
      throw error;
    }

    const rows = ((data as Palco[]) || []).map((row) => this.normalizarPalcoJoin(row));

    return {
      data: rows,
      total: count ?? 0,
      page,
      limit,
      totalPages: Math.ceil((count ?? 0) / limit)
    };
  }

  private normalizarPalcoJoin(row: Palco): Palco {
    const tb = row.tipos_boleta;
    if (Array.isArray(tb)) {
      return { ...row, tipos_boleta: tb[0] ?? null };
    }
    return row;
  }

  /**
   * Marca un palco como reservado sin compra (bloqueo administrativo).
   * No aparece en la selección del cliente (solo estado disponible es elegible).
   */
  async reservarPalcoAdministrativo(palcoId: number): Promise<void> {
    const now = this.timezoneService.getCurrentDateISO();
    const { data, error } = await this.supabase
      .from('palcos')
      .update({
        estado: EstadoPalco.RESERVADO,
        compra_id: null,
        fecha_actualizacion: now
      })
      .eq('id', palcoId)
      .eq('estado', EstadoPalco.DISPONIBLE)
      .select('id')
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) {
      throw new Error('El palco no está disponible o ya fue actualizado.');
    }
  }

  /**
   * Libera un palco reservado solo por admin (sin compra_id). No toca reservas de checkout.
   */
  async liberarBloqueoAdministrativo(palcoId: number): Promise<void> {
    const now = this.timezoneService.getCurrentDateISO();
    const { data, error } = await this.supabase
      .from('palcos')
      .update({
        estado: EstadoPalco.DISPONIBLE,
        compra_id: null,
        fecha_actualizacion: now
      })
      .eq('id', palcoId)
      .eq('estado', EstadoPalco.RESERVADO)
      .is('compra_id', null)
      .select('id')
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) {
      throw new Error(
        'No se pudo liberar: solo aplica a reservas administrativas (sin compra asociada).'
      );
    }
  }
}

