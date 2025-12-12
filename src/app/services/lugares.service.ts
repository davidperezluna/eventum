/* ============================================
   LUGARES SERVICE
   ============================================ */

import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { Lugar, PaginatedResponse, BaseFilters } from '../types';

export interface LugarFilters extends BaseFilters {
  activo?: boolean;
  ciudad?: string;
  pais?: string;
}

@Injectable({
  providedIn: 'root'
})
export class LugaresService {
  constructor(
    private supabase: SupabaseService
  ) {}

  /**
   * Obtiene todos los lugares
   */
  getLugares(filters?: LugarFilters): Observable<PaginatedResponse<Lugar>> {
    let query = this.supabase.from('lugares').select('*', { count: 'exact' });

    if (filters?.activo !== undefined) {
      query = query.eq('activo', filters.activo);
    }
    if (filters?.ciudad) {
      query = query.eq('ciudad', filters.ciudad);
    }
    if (filters?.pais) {
      query = query.eq('pais', filters.pais);
    }
    if (filters?.search) {
      query = query.or(`nombre.ilike.%${filters.search}%,direccion.ilike.%${filters.search}%,ciudad.ilike.%${filters.search}%`);
    }

    const sortBy = filters?.sortBy || 'nombre';
    const sortOrder = filters?.sortOrder || 'asc';
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const fromIndex = (page - 1) * limit;
    const toIndex = fromIndex + limit - 1;
    query = query.range(fromIndex, toIndex);

    return from(query).pipe(
      map(({ data, error, count }) => {
            if (error) {
              console.error('Error en getLugares:', error);
          throw error;
            }
            
            const total = count || 0;
            const lugares = (data as Lugar[]) || [];
            console.log('Lugares cargados:', lugares.length, 'de', total);
            
        return {
              data: lugares,
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
   * Obtiene un lugar por ID
   */
  getLugarById(id: number): Observable<Lugar> {
    return from(
      this.supabase
            .from('lugares')
            .select('*')
            .eq('id', id)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as Lugar;
      }),
      catchError((error) => throwError(() => error))
    );
  }

  /**
   * Normaliza los valores numéricos para evitar errores de precisión
   */
  private normalizeLugarData(lugar: Partial<Lugar>): Partial<Lugar> {
    const normalized = { ...lugar };

    // Normalizar latitud (precisión 10, escala 8 = máximo 99.99999999)
    if (normalized.latitud !== undefined && normalized.latitud !== null) {
      const lat = Number(normalized.latitud);
      if (!isNaN(lat)) {
        // Limitar a rango válido y redondear a 8 decimales
        const clampedLat = Math.max(-90, Math.min(90, lat));
        normalized.latitud = Math.round(clampedLat * 100000000) / 100000000;
      } else {
        delete normalized.latitud;
      }
    }

    // Normalizar longitud (precisión 10, escala 8 = máximo 99.99999999)
    if (normalized.longitud !== undefined && normalized.longitud !== null) {
      const lng = Number(normalized.longitud);
      if (!isNaN(lng)) {
        // Limitar a rango válido y redondear a 8 decimales
        // Nota: Si la BD solo acepta hasta 99.99999999, limitamos a ese rango
        const clampedLng = Math.max(-99.99999999, Math.min(99.99999999, lng));
        normalized.longitud = Math.round(clampedLng * 100000000) / 100000000;
      } else {
        delete normalized.longitud;
      }
    }

    // Normalizar capacidad_maxima
    if (normalized.capacidad_maxima !== undefined && normalized.capacidad_maxima !== null) {
      const cap = Number(normalized.capacidad_maxima);
      if (!isNaN(cap) && cap > 0) {
        normalized.capacidad_maxima = Math.floor(cap);
      } else {
        delete normalized.capacidad_maxima;
      }
    }

    return normalized;
  }

  /**
   * Crea un nuevo lugar
   */
  createLugar(lugar: Partial<Lugar>): Observable<Lugar> {
          const normalizedLugar = this.normalizeLugarData(lugar);
          console.log('Creando lugar con datos normalizados:', normalizedLugar);

    return from(
      this.supabase
            .from('lugares')
            .insert(normalizedLugar)
            .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
            if (error) {
              console.error('Error creando lugar:', error);
          throw error;
        }
              console.log('Lugar creado exitosamente:', data);
        return data as Lugar;
      }),
      catchError((error) => throwError(() => error))
    );
  }

  /**
   * Actualiza un lugar
   */
  updateLugar(id: number, lugar: Partial<Lugar>): Observable<Lugar> {
          const normalizedLugar = this.normalizeLugarData(lugar);
          console.log('Actualizando lugar con datos normalizados:', normalizedLugar);

    return from(
      this.supabase
            .from('lugares')
            .update(normalizedLugar)
            .eq('id', id)
            .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
            if (error) {
              console.error('Error actualizando lugar:', error);
          throw error;
        }
              console.log('Lugar actualizado exitosamente:', data);
        return data as Lugar;
      }),
      catchError((error) => throwError(() => error))
    );
  }

  /**
   * Elimina un lugar (soft delete)
   */
  deleteLugar(id: number): Observable<void> {
    return from(
      this.supabase
            .from('lugares')
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
}
