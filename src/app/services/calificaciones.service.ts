/* ============================================
   CALIFICACIONES SERVICE
   ============================================ */

import { Injectable, NgZone } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { Calificacion, PaginatedResponse, BaseFilters } from '../types';

export interface CalificacionFilters extends BaseFilters {
  evento_id?: number;
  cliente_id?: number;
  activo?: boolean;
  calificacion_min?: number;
  calificacion_max?: number;
}

@Injectable({
  providedIn: 'root'
})
export class CalificacionesService {
  constructor(
    private supabase: SupabaseService,
    private ngZone: NgZone
  ) {}

  /**
   * Obtiene todas las calificaciones
   */
  getCalificaciones(filters?: CalificacionFilters): Observable<PaginatedResponse<Calificacion>> {
    let query = this.supabase.from('calificaciones').select('*', { count: 'exact' });

    if (filters?.evento_id) {
      query = query.eq('evento_id', filters.evento_id);
    }
    if (filters?.cliente_id) {
      query = query.eq('cliente_id', filters.cliente_id);
    }
    if (filters?.activo !== undefined) {
      query = query.eq('activo', filters.activo);
    }
    if (filters?.calificacion_min) {
      query = query.gte('calificacion', filters.calificacion_min);
    }
    if (filters?.calificacion_max) {
      query = query.lte('calificacion', filters.calificacion_max);
    }

    const sortBy = filters?.sortBy || 'fecha_calificacion';
    const sortOrder = filters?.sortOrder || 'desc';
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const fromIndex = (page - 1) * limit;
    const toIndex = fromIndex + limit - 1;
    query = query.range(fromIndex, toIndex);

    return new Observable(observer => {
      this.ngZone.runOutsideAngular(async () => {
        try {
          const { data, error, count } = await query;
          this.ngZone.run(() => {
            if (error) {
              console.error('Error en getCalificaciones:', error);
              observer.error(error);
              return;
            }
            
            const total = count || 0;
            const calificaciones = (data as Calificacion[]) || [];
            console.log('Calificaciones cargadas:', calificaciones.length, 'de', total);
            console.log('Datos de calificaciones:', calificaciones);
            
            const response: PaginatedResponse<Calificacion> = {
              data: calificaciones,
              total,
              page,
              limit,
              totalPages: Math.ceil(total / limit)
            };
            
            console.log('Enviando respuesta al observer:', response);
            observer.next(response);
            observer.complete();
            console.log('Observer completado en calificaciones');
          });
        } catch (error: any) {
          this.ngZone.run(() => {
            observer.error(error);
          });
        }
      });
    });
  }

  /**
   * Actualiza una calificación (moderación)
   */
  updateCalificacion(id: number, calificacion: Partial<Calificacion>): Observable<Calificacion> {
    return new Observable(observer => {
      this.ngZone.runOutsideAngular(async () => {
        try {
          const { data, error } = await this.supabase
            .from('calificaciones')
            .update({ ...calificacion, fecha_actualizacion: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
          
          this.ngZone.run(() => {
            if (error) {
              observer.error(error);
            } else {
              observer.next(data as Calificacion);
              observer.complete();
            }
          });
        } catch (error: any) {
          this.ngZone.run(() => {
            observer.error(error);
          });
        }
      });
    });
  }

  /**
   * Desactiva una calificación (moderación)
   */
  desactivarCalificacion(id: number): Observable<void> {
    return new Observable(observer => {
      this.ngZone.runOutsideAngular(async () => {
        try {
          const { error } = await this.supabase
            .from('calificaciones')
            .update({ activo: false, fecha_actualizacion: new Date().toISOString() })
            .eq('id', id);
          
          this.ngZone.run(() => {
            if (error) {
              observer.error(error);
            } else {
              observer.next();
              observer.complete();
            }
          });
        } catch (error: any) {
          this.ngZone.run(() => {
            observer.error(error);
          });
        }
      });
    });
  }
}
