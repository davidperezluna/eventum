/* ============================================
   CATEGORIAS SERVICE
   ============================================ */

import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { CategoriaEvento, PaginatedResponse, BaseFilters } from '../types';

export interface CategoriaFilters extends BaseFilters {
  activo?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class CategoriasService {
  constructor(
    private supabase: SupabaseService
  ) {}

  /**
   * Obtiene todas las categorías
   */
  getCategorias(filters?: CategoriaFilters): Observable<PaginatedResponse<CategoriaEvento>> {
    let query = this.supabase.from('categorias_evento').select('*', { count: 'exact' });

    if (filters?.activo !== undefined) {
      query = query.eq('activo', filters.activo);
    }
    if (filters?.search) {
      query = query.or(`nombre.ilike.%${filters.search}%,descripcion.ilike.%${filters.search}%`);
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
              console.error('Error en getCategorias:', error);
          throw error;
            }
            
            const total = count || 0;
            const categorias = (data as CategoriaEvento[]) || [];
            console.log('Categorías cargadas:', categorias.length, 'de', total);
            
        return {
              data: categorias,
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
   * Obtiene una categoría por ID
   */
  getCategoriaById(id: number): Observable<CategoriaEvento> {
    return from(
      this.supabase
            .from('categorias_evento')
            .select('*')
            .eq('id', id)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as CategoriaEvento;
      }),
      catchError((error) => throwError(() => error))
    );
  }

  /**
   * Crea una nueva categoría
   */
  createCategoria(categoria: Partial<CategoriaEvento>): Observable<CategoriaEvento> {
    return from(
      this.supabase
            .from('categorias_evento')
            .insert(categoria)
            .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as CategoriaEvento;
      }),
      catchError((error) => throwError(() => error))
    );
  }

  /**
   * Actualiza una categoría
   */
  updateCategoria(id: number, categoria: Partial<CategoriaEvento>): Observable<CategoriaEvento> {
    return from(
      this.supabase
            .from('categorias_evento')
            .update(categoria)
            .eq('id', id)
            .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as CategoriaEvento;
      }),
      catchError((error) => throwError(() => error))
    );
  }

  /**
   * Elimina una categoría (soft delete)
   */
  deleteCategoria(id: number): Observable<void> {
    return from(
      this.supabase
            .from('categorias_evento')
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
