/* ============================================
   EVENTOS SERVICE
   ============================================ */

import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { SupabaseObservableHelper } from './supabase-observable.helper';
import { Evento, EventoFilters, ApiResponse, PaginatedResponse } from '../types';

@Injectable({
  providedIn: 'root'
})
export class EventosService {
  constructor(
    private supabase: SupabaseService,
    private supabaseHelper: SupabaseObservableHelper
  ) {}
  private tableName = 'eventos';

  /**
   * Obtiene todos los eventos con filtros opcionales
   */
  getEventos(filters?: EventoFilters): Observable<PaginatedResponse<Evento>> {
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

    // Usar timeout más largo para consultas grandes
    const timeout = limit > 100 ? 30000 : 15000; // 30s para consultas grandes, 15s para normales
    return this.supabaseHelper.fromSupabase(query, timeout).pipe(
      map(({ data, error, count }) => {
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
      }),
      catchError((error) => {
        console.error('Error catch en getEventos:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Obtiene un evento por ID
   */
  getEventoById(id: number): Observable<Evento> {
    return this.supabaseHelper.fromSupabase(
      this.supabase
            .from(this.tableName)
            .select('*')
            .eq('id', id)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as Evento;
      }),
      catchError((error) => throwError(() => error))
    );
  }

  /**
   * Crea un nuevo evento
   */
  createEvento(evento: Partial<Evento>): Observable<Evento> {
    return this.supabaseHelper.fromSupabase(
      this.supabase
            .from(this.tableName)
            .insert(evento)
            .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as Evento;
      }),
      catchError((error) => throwError(() => error))
    );
  }

  /**
   * Actualiza un evento
   */
  updateEvento(id: number, evento: Partial<Evento>): Observable<Evento> {
    return this.supabaseHelper.fromSupabase(
      this.supabase
            .from(this.tableName)
            .update({ ...evento, fecha_actualizacion: new Date().toISOString() })
            .eq('id', id)
            .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as Evento;
      }),
      catchError((error) => throwError(() => error))
    );
  }

  /**
   * Elimina un evento (soft delete)
   */
  deleteEvento(id: number): Observable<void> {
    return this.supabaseHelper.fromSupabase(
      this.supabase
            .from(this.tableName)
            .update({ activo: false })
        .eq('id', id)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return;
      }),
      catchError((error) => throwError(() => error))
    );
  }

  /**
   * Obtiene eventos próximos
   */
  getEventosProximos(limit: number = 5): Observable<Evento[]> {
    const now = new Date().toISOString();
    return this.supabaseHelper.fromSupabase(
      this.supabase
            .from(this.tableName)
            .select('*')
            .eq('activo', true)
            .gte('fecha_inicio', now)
            .order('fecha_inicio', { ascending: true })
        .limit(limit)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data as Evento[]) || [];
      }),
      catchError((error) => throwError(() => error))
    );
  }
}
