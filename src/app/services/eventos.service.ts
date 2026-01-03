/* ============================================
   EVENTOS SERVICE
   ============================================ */

import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { TimezoneService } from './timezone.service';
import { Evento, EventoFilters, ApiResponse, PaginatedResponse, TipoEstadoEvento } from '../types';

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
      // Seleccionar eventos incluyendo información del lugar
      // Usar 'estimated' para consultas grandes (limit > 100) para mejor rendimiento
      const limit = filters?.limit || 10;
      const useEstimatedCount = limit > 100;
      let query = this.supabase.from(this.tableName).select('*, lugares(*)', {
        count: useEstimatedCount ? 'estimated' : 'exact'
      });

      // ... resto de los filtros ...
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

      // Paginación
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
      const rawEventos = data || [];
      
      // Mapear lugares a lugar para cada evento
      const eventos = rawEventos.map((ev: any) => {
        const evento = { ...ev };
        if (evento.lugares) {
          evento.lugar = evento.lugares;
          delete evento.lugares;
        }
        return evento;
      }) as Evento[];

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
   * Obtiene un evento por ID, incluyendo información del lugar
   */
  async getEventoById(id: number): Promise<Evento> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*, lugares(*)')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error en getEventoById:', error);
        throw error;
      }

      if (!data) {
        throw new Error(`Evento con ID ${id} no encontrado`);
      }

      // Mapear lugares a lugar para mantener compatibilidad con el frontend
      const result = { ...data };
      if (result.lugares) {
        result.lugar = result.lugares;
        delete result.lugares;
      }

      return result as Evento;
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
      const now = this.timezoneService.getCurrentDateISO();
      const { data, error } = await this.supabase
        .from(this.tableName)
        .insert({ 
          ...evento, 
          fecha_creacion: now,
          fecha_actualizacion: now 
        })
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
   * Obtiene eventos próximos incluyendo información del lugar
   */
  async getEventosProximos(limit: number = 5): Promise<Evento[]> {
    try {
      const now = this.timezoneService.getCurrentDateISO();
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*, lugares(*)')
        .eq('activo', true)
        .gte('fecha_inicio', now)
        .order('fecha_inicio', { ascending: true })
        .limit(limit);

      if (error) throw error;
      const rawData = data || [];
      
      return rawData.map((ev: any) => {
        const evento = { ...ev };
        if (evento.lugares) {
          evento.lugar = evento.lugares;
          delete evento.lugares;
        }
        return evento;
      }) as Evento[];
    } catch (error) {
      throw error;
    }
  }

  /**
   * Verifica y actualiza eventos que han finalizado
   * Actualiza el estado a 'finalizado' y activo a false si la fecha_fin ya pasó
   */
  async verificarYActualizarEventosFinalizados(): Promise<number> {
    try {
      const ahora = this.timezoneService.getCurrentDateISO();
      
      // Buscar eventos que aún no están finalizados pero cuya fecha_fin ya pasó
      const { data: eventosFinalizados, error } = await this.supabase
        .from(this.tableName)
        .select('id')
        .neq('estado', TipoEstadoEvento.FINALIZADO)
        .neq('estado', TipoEstadoEvento.CANCELADO)
        .lt('fecha_fin', ahora);

      if (error) {
        console.error('Error buscando eventos finalizados:', error);
        throw error;
      }

      if (!eventosFinalizados || eventosFinalizados.length === 0) {
        return 0;
      }

      // Actualizar todos los eventos finalizados
      const ids = eventosFinalizados.map(e => e.id);
      const { error: updateError } = await this.supabase
        .from(this.tableName)
        .update({
          estado: TipoEstadoEvento.FINALIZADO,
          activo: false,
          fecha_actualizacion: ahora
        })
        .in('id', ids);

      if (updateError) {
        console.error('Error actualizando eventos finalizados:', updateError);
        throw updateError;
      }

      console.log(`Se actualizaron ${ids.length} eventos a estado finalizado`);
      return ids.length;
    } catch (error) {
      console.error('Error en verificarYActualizarEventosFinalizados:', error);
      throw error;
    }
  }

  /**
   * Verifica si un evento específico ha finalizado y lo actualiza si es necesario
   * @param eventoId ID del evento a verificar
   * @param actualizar Si es true, actualiza el estado. Si es false, solo verifica sin actualizar.
   */
  async verificarEventoFinalizado(eventoId: number, actualizar: boolean = false): Promise<boolean> {
    try {
      const evento = await this.getEventoById(eventoId);
      const ahora = new Date();
      const fechaFin = new Date(evento.fecha_fin);
      
      if (fechaFin < ahora && evento.estado !== TipoEstadoEvento.FINALIZADO && evento.estado !== TipoEstadoEvento.CANCELADO) {
        if (actualizar) {
          await this.updateEvento(eventoId, {
            estado: TipoEstadoEvento.FINALIZADO,
            activo: false
          });
        }
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error verificando evento finalizado:', error);
      return false;
    }
  }
}
