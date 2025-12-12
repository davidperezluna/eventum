/* ============================================
   BOLETAS SERVICE
   ============================================ */

import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { BoletaComprada, TipoBoleta, BoletaFilters, PaginatedResponse } from '../types';

@Injectable({
  providedIn: 'root'
})
export class BoletasService {
  constructor(
    private supabase: SupabaseService
  ) {}

  /**
   * Obtiene todas las boletas compradas con filtros opcionales
   */
  getBoletasCompradas(filters?: BoletaFilters): Observable<PaginatedResponse<BoletaComprada>> {
    let query = this.supabase.from('boletas_compradas').select('*', { count: 'exact' });

    // Aplicar filtros
    if (filters?.compra_id) {
      query = query.eq('compra_id', filters.compra_id);
    }
    if (filters?.tipo_boleta_id) {
      query = query.eq('tipo_boleta_id', filters.tipo_boleta_id);
    }
    if (filters?.estado) {
      query = query.eq('estado', filters.estado);
    }

    // Ordenamiento
    const sortBy = filters?.sortBy || 'fecha_creacion';
    const sortOrder = filters?.sortOrder || 'desc';
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    // Paginación
    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const fromIndex = (page - 1) * limit;
    const toIndex = fromIndex + limit - 1;
    query = query.range(fromIndex, toIndex);

    return from(query).pipe(
      map(({ data, error, count }) => {
        if (error) {
          console.error('Error en getBoletasCompradas:', error);
          throw error;
        }
        
        const total = count || 0;
        const boletas = (data as BoletaComprada[]) || [];
        console.log('Boletas cargadas:', boletas.length, 'de', total);
        
        return {
          data: boletas,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        };
      }),
      catchError((error) => throwError(() => error))
    );
  }

  /**
   * Obtiene los tipos de boleta de un evento
   */
  getTiposBoleta(eventoId: number): Observable<TipoBoleta[]> {
    return from(
      this.supabase
        .from('tipos_boleta')
        .select('*')
        .eq('evento_id', eventoId)
        .eq('activo', true)
        .order('precio', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data as TipoBoleta[]) || [];
      }),
      catchError((error) => throwError(() => error))
    );
  }

  /**
   * Crea un nuevo tipo de boleta
   */
  createTipoBoleta(tipoBoleta: Partial<TipoBoleta>): Observable<TipoBoleta> {
    return from(
      this.supabase
        .from('tipos_boleta')
        .insert(tipoBoleta)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as TipoBoleta;
      }),
      catchError((error) => throwError(() => error))
    );
  }

  /**
   * Actualiza un tipo de boleta
   */
  updateTipoBoleta(id: number, tipoBoleta: Partial<TipoBoleta>): Observable<TipoBoleta> {
    return from(
      this.supabase
        .from('tipos_boleta')
        .update(tipoBoleta)
        .eq('id', id)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as TipoBoleta;
      }),
      catchError((error) => throwError(() => error))
    );
  }

  /**
   * Obtiene un tipo de boleta por ID
   */
  getTipoBoletaById(id: number): Observable<TipoBoleta> {
    return from(
      this.supabase
        .from('tipos_boleta')
        .select('*')
        .eq('id', id)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as TipoBoleta;
      }),
      catchError((error) => throwError(() => error))
    );
  }

  /**
   * Obtiene todos los tipos de boleta con filtros opcionales
   */
  getAllTiposBoleta(filters?: { evento_id?: number; activo?: boolean }): Observable<TipoBoleta[]> {
    let query = this.supabase.from('tipos_boleta').select('*');
    
    if (filters?.evento_id) {
      query = query.eq('evento_id', filters.evento_id);
    }
    if (filters?.activo !== undefined) {
      query = query.eq('activo', filters.activo);
    }
    
    query = query.order('fecha_creacion', { ascending: false });
    
    return from(query).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data as TipoBoleta[]) || [];
      }),
      catchError((error) => throwError(() => error))
    );
  }
}
