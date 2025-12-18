/* ============================================
   CALIFICACIONES SERVICE
   ============================================ */

import { Injectable, NgZone } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { TimezoneService } from './timezone.service';
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
    private ngZone: NgZone,
    private timezoneService: TimezoneService
  ) {}

  /**
   * Obtiene todas las calificaciones
   */
  async getCalificaciones(filters?: CalificacionFilters): Promise<PaginatedResponse<Calificacion>> {
    return new Promise((resolve, reject) => {
      this.ngZone.runOutsideAngular(async () => {
        try {
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

          const { data, error, count } = await query;
          
          this.ngZone.run(() => {
            if (error) {
              console.error('Error en getCalificaciones:', error);
              reject(error);
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
            
            console.log('Enviando respuesta:', response);
            resolve(response);
          });
        } catch (error: any) {
          this.ngZone.run(() => {
            reject(error);
          });
        }
      });
    });
  }

  /**
   * Actualiza una calificación (moderación)
   */
  async updateCalificacion(id: number, calificacion: Partial<Calificacion>): Promise<Calificacion> {
    return new Promise((resolve, reject) => {
      this.ngZone.runOutsideAngular(async () => {
        try {
          const { data, error } = await this.supabase
            .from('calificaciones')
            .update({ ...calificacion, fecha_actualizacion: this.timezoneService.getCurrentDateISO() })
            .eq('id', id)
            .select()
            .single();
          
          this.ngZone.run(() => {
            if (error) {
              reject(error);
            } else {
              resolve(data as Calificacion);
            }
          });
        } catch (error: any) {
          this.ngZone.run(() => {
            reject(error);
          });
        }
      });
    });
  }

  /**
   * Desactiva una calificación (moderación)
   */
  async desactivarCalificacion(id: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ngZone.runOutsideAngular(async () => {
        try {
          const { error } = await this.supabase
            .from('calificaciones')
            .update({ activo: false, fecha_actualizacion: this.timezoneService.getCurrentDateISO() })
            .eq('id', id);
          
          this.ngZone.run(() => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        } catch (error: any) {
          this.ngZone.run(() => {
            reject(error);
          });
        }
      });
    });
  }
}
