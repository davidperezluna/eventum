/* ============================================
   BOLETAS SERVICE
   ============================================ */

import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { SupabaseObservableHelper } from './supabase-observable.helper';
import { BoletaComprada, TipoBoleta, BoletaFilters, PaginatedResponse } from '../types';

@Injectable({
  providedIn: 'root'
})
export class BoletasService {
  constructor(
    private supabase: SupabaseService,
    private supabaseHelper: SupabaseObservableHelper
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
    // Si hay filtro por evento_id pero no por tipo_boleta_id, necesitamos filtrar por los tipos del evento
    if (filters?.evento_id && !filters?.tipo_boleta_id) {
      // Primero obtener los tipos de boleta del evento
      return this.supabaseHelper.fromSupabase(
        this.supabase
          .from('tipos_boleta')
          .select('id')
          .eq('evento_id', filters.evento_id)
      ).pipe(
        switchMap(({ data: tiposData, error: tiposError }) => {
          if (tiposError) throw tiposError;
          const tipoIds = (tiposData as { id: number }[]).map(t => t.id);
          
          if (tipoIds.length === 0) {
            // Si no hay tipos, retornar vacío
            return this.supabaseHelper.fromSupabase(Promise.resolve({
              data: [],
              error: null,
              count: 0
            })).pipe(
              map((response) => {
                if (response.error) throw response.error;
                return {
                  data: [],
                  total: 0,
                  page: filters?.page || 1,
                  limit: filters?.limit || 10,
                  totalPages: 0
                };
              })
            );
          }
          
          // Ahora filtrar boletas por esos tipos
          let boletasQuery = this.supabase
            .from('boletas_compradas')
            .select('*', { count: 'exact' })
            .in('tipo_boleta_id', tipoIds);
          
          // Aplicar otros filtros
          if (filters?.estado) {
            boletasQuery = boletasQuery.eq('estado', filters.estado);
          }
          if (filters?.codigo_qr) {
            boletasQuery = boletasQuery.ilike('codigo_qr', `%${filters.codigo_qr}%`);
          }
          if (filters?.nombre_asistente) {
            boletasQuery = boletasQuery.ilike('nombre_asistente', `%${filters.nombre_asistente}%`);
          }
          if (filters?.email_asistente) {
            boletasQuery = boletasQuery.ilike('email_asistente', `%${filters.email_asistente}%`);
          }
          if (filters?.telefono_asistente) {
            boletasQuery = boletasQuery.ilike('telefono_asistente', `%${filters.telefono_asistente}%`);
          }
          if (filters?.fecha_desde) {
            boletasQuery = boletasQuery.gte('fecha_creacion', filters.fecha_desde);
          }
          if (filters?.fecha_hasta) {
            boletasQuery = boletasQuery.lte('fecha_creacion', filters.fecha_hasta);
          }
          if (filters?.documento_asistente) {
            boletasQuery = boletasQuery.ilike('documento_asistente', `%${filters.documento_asistente}%`);
          }
          if (filters?.search) {
            const searchTerm = `%${filters.search}%`;
            boletasQuery = boletasQuery.or(`codigo_qr.ilike.${searchTerm},nombre_asistente.ilike.${searchTerm},email_asistente.ilike.${searchTerm}`);
          }
          
          // Ordenamiento
          const sortBy = filters?.sortBy || 'fecha_creacion';
          const sortOrder = filters?.sortOrder || 'desc';
          boletasQuery = boletasQuery.order(sortBy, { ascending: sortOrder === 'asc' });
          
          // Paginación
          const page = filters?.page || 1;
          const limit = filters?.limit || 10;
          const fromIndex = (page - 1) * limit;
          const toIndex = fromIndex + limit - 1;
          boletasQuery = boletasQuery.range(fromIndex, toIndex);
          
          return this.supabaseHelper.fromSupabase(boletasQuery).pipe(
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
            })
          );
        }),
        catchError((error) => throwError(() => error))
      );
    }
    
    if (filters?.estado) {
      query = query.eq('estado', filters.estado);
    }
    if (filters?.codigo_qr) {
      query = query.ilike('codigo_qr', `%${filters.codigo_qr}%`);
    }
    if (filters?.nombre_asistente) {
      query = query.ilike('nombre_asistente', `%${filters.nombre_asistente}%`);
    }
    if (filters?.email_asistente) {
      query = query.ilike('email_asistente', `%${filters.email_asistente}%`);
    }
    if (filters?.telefono_asistente) {
      query = query.ilike('telefono_asistente', `%${filters.telefono_asistente}%`);
    }
    if (filters?.fecha_desde) {
      query = query.gte('fecha_creacion', filters.fecha_desde);
    }
    if (filters?.fecha_hasta) {
      query = query.lte('fecha_creacion', filters.fecha_hasta);
    }
    // Búsqueda general (busca en código QR, nombre, email)
    if (filters?.search) {
      const searchTerm = `%${filters.search}%`;
      query = query.or(`codigo_qr.ilike.${searchTerm},nombre_asistente.ilike.${searchTerm},email_asistente.ilike.${searchTerm}`);
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

    return this.supabaseHelper.fromSupabase(query).pipe(
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
    return this.supabaseHelper.fromSupabase(
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
    return this.supabaseHelper.fromSupabase(
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
    return this.supabaseHelper.fromSupabase(
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
    return this.supabaseHelper.fromSupabase(
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
    
    return this.supabaseHelper.fromSupabase(query).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data as TipoBoleta[]) || [];
      }),
      catchError((error) => throwError(() => error))
    );
  }

  /**
   * Valida una boleta (cambia su estado a 'usada')
   */
  validarBoleta(boletaId: number): Observable<BoletaComprada> {
    return this.supabaseHelper.fromSupabase(
      this.supabase
        .from('boletas_compradas')
        .update({ 
          estado: 'usada',
          fecha_uso: new Date().toISOString()
        })
        .eq('id', boletaId)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as BoletaComprada;
      }),
      catchError((error) => throwError(() => error))
    );
  }

  /**
   * Busca una boleta por código QR
   */
  buscarBoletaPorCodigoQR(codigoQR: string): Observable<BoletaComprada | null> {
    return this.supabaseHelper.fromSupabase(
      this.supabase
        .from('boletas_compradas')
        .select('*')
        .eq('codigo_qr', codigoQR)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          // Si no se encuentra, retornar null en lugar de lanzar error
          if (error.code === 'PGRST116') {
            return null;
          }
          throw error;
        }
        return data as BoletaComprada;
      }),
      catchError((error) => throwError(() => error))
    );
  }

  /**
   * Busca boletas por documento del asistente
   */
  buscarBoletasPorDocumento(documento: string): Observable<BoletaComprada[]> {
    return this.supabaseHelper.fromSupabase(
      this.supabase
        .from('boletas_compradas')
        .select('*')
        .ilike('documento_asistente', `%${documento}%`)
        .order('fecha_creacion', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data as BoletaComprada[]) || [];
      }),
      catchError((error) => throwError(() => error))
    );
  }
}
