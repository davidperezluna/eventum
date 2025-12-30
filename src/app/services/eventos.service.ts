/* ============================================
   EVENTOS SERVICE
   ============================================ */

import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { TimezoneService } from './timezone.service';
import { Evento, EventoFilters, ApiResponse, PaginatedResponse } from '../types';

@Injectable({
  providedIn: 'root'
})
export class EventosService {
  constructor(
    private supabase: SupabaseService,
    private timezoneService: TimezoneService
  ) { }
  private tableName = 'eventos';

  /**
   * Obtiene todos los eventos con filtros opcionales
   */
  async getEventos(filters?: EventoFilters): Promise<PaginatedResponse<Evento>> {
    try {
      // Seleccionar eventos (las relaciones se pueden agregar después si es necesario)
      // Usar 'estimated' para consultas grandes (limit > 100) para mejor rendimiento
      const limit = filters?.limit || 10;
      const useEstimatedCount = limit > 100;
      let query = this.supabase.from(this.tableName).select('*', {
        count: useEstimatedCount ? 'estimated' : 'exact'
      });

      // Aplicar filtros
      if (filters?.categoria_id) {
        query = query.eq('categoria_id', filters.categoria_id);
      }
      if (filters?.organizador_id) {
        query = query.eq('organizador_id', filters.organizador_id);
      }
      if (filters?.estado) {
        query = query.eq('estado', filters.estado);
      }
      if (filters?.destacado !== undefined) {
        query = query.eq('destacado', filters.destacado);
      }
      if (filters?.activo !== undefined) {
        query = query.eq('activo', filters.activo);
      }
      if (filters?.search) {
        query = query.or(`titulo.ilike.%${filters.search}%,descripcion.ilike.%${filters.search}%`);
      }

      // Ordenamiento
      const sortBy = filters?.sortBy || 'fecha_creacion';
      const sortOrder = filters?.sortOrder || 'desc';
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      // Paginación (limit ya está declarado arriba)
      const page = filters?.page || 1;
      const fromIndex = (page - 1) * limit;
      const toIndex = fromIndex + limit - 1;
      query = query.range(fromIndex, toIndex);

      const { data, error, count } = await query;

      if (error) {
        console.error('Error en getEventos:', error);
        throw error;
      }

      const total = count || 0;
      const eventos = (data as Evento[]) || [];
      console.log('Eventos cargados:', eventos.length, 'de', total);

      return {
        data: eventos,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      console.error('Error catch en getEventos:', error);
      throw error;
    }
  }

  /**
   * Obtiene un evento por ID
   */
  async getEventoById(id: number): Promise<Evento> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error en getEventoById:', error);
        throw error;
      }

      if (!data) {
        throw new Error(`Evento con ID ${id} no encontrado`);
      }

      return data as Evento;
    } catch (error) {
      console.error('Error catch en getEventoById:', error);
      throw error;
    }
  }

  /**
   * Crea un nuevo evento
   */
  async createEvento(evento: Partial<Evento>): Promise<Evento> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .insert(evento)
        .select()
        .single();

      if (error) throw error;
      return data as Evento;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Actualiza un evento
   */
  async updateEvento(id: number, evento: Partial<Evento>): Promise<Evento> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .update({ ...evento, fecha_actualizacion: this.timezoneService.getCurrentDateISO() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Evento;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Elimina un evento (soft delete)
   */
  async deleteEvento(id: number): Promise<void> {
    try {
      const { error } = await this.supabase
        .from(this.tableName)
        .update({ activo: false })
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Obtiene eventos próximos
   */
  async getEventosProximos(limit: number = 5): Promise<Evento[]> {
    try {
      const now = this.timezoneService.getCurrentDateISO();
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('activo', true)
        .gte('fecha_inicio', now)
        .order('fecha_inicio', { ascending: true })
        .limit(limit);

      if (error) throw error;
      return (data as Evento[]) || [];
    } catch (error) {
      throw error;
    }
  }
}
