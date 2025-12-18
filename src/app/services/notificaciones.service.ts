/* ============================================
   NOTIFICACIONES SERVICE
   ============================================ */

import { Injectable, NgZone } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { TimezoneService } from './timezone.service';
import { Notificacion, PaginatedResponse, BaseFilters, TipoTipoNotificacion } from '../types';

export interface NotificacionFilters extends BaseFilters {
  usuario_id?: number;
  tipo?: TipoTipoNotificacion;
  leida?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class NotificacionesService {
  constructor(
    private supabase: SupabaseService,
    private ngZone: NgZone,
    private timezoneService: TimezoneService
  ) {}

  /**
   * Obtiene todas las notificaciones
   */
  async getNotificaciones(filters?: NotificacionFilters): Promise<PaginatedResponse<Notificacion>> {
    return new Promise((resolve, reject) => {
      this.ngZone.runOutsideAngular(async () => {
        try {
          let query = this.supabase.from('notificaciones').select('*', { count: 'exact' });

          if (filters?.usuario_id) {
            query = query.eq('usuario_id', filters.usuario_id);
          }
          if (filters?.tipo) {
            query = query.eq('tipo', filters.tipo);
          }
          if (filters?.leida !== undefined) {
            query = query.eq('leida', filters.leida);
          }

          const sortBy = filters?.sortBy || 'fecha_creacion';
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
              console.error('Error en getNotificaciones:', error);
              reject(error);
              return;
            }
            
            const total = count || 0;
            const notificaciones = (data as Notificacion[]) || [];
            console.log('Notificaciones cargadas:', notificaciones.length, 'de', total);
            console.log('Datos de notificaciones:', notificaciones);
            
            const response: PaginatedResponse<Notificacion> = {
              data: notificaciones,
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
   * Crea una nueva notificación
   */
  async createNotificacion(notificacion: Partial<Notificacion>): Promise<Notificacion> {
    return new Promise((resolve, reject) => {
      this.ngZone.runOutsideAngular(async () => {
        try {
          const { data, error } = await this.supabase
            .from('notificaciones')
            .insert(notificacion)
            .select()
            .single();
          
          this.ngZone.run(() => {
            if (error) {
              reject(error);
            } else {
              resolve(data as Notificacion);
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
   * Crea notificaciones masivas para múltiples usuarios
   */
  async createNotificacionesMasivas(usuarioIds: number[], titulo: string, mensaje: string, tipo?: TipoTipoNotificacion): Promise<Notificacion[]> {
    const notificaciones = usuarioIds.map(usuario_id => ({
      usuario_id,
      titulo,
      mensaje,
      tipo: tipo || TipoTipoNotificacion.INFO
    }));

    return new Promise((resolve, reject) => {
      this.ngZone.runOutsideAngular(async () => {
        try {
          const { data, error } = await this.supabase
            .from('notificaciones')
            .insert(notificaciones)
            .select();
          
          this.ngZone.run(() => {
            if (error) {
              reject(error);
            } else {
              resolve((data as Notificacion[]) || []);
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
   * Marca una notificación como leída
   */
  async marcarComoLeida(id: number): Promise<Notificacion> {
    return new Promise((resolve, reject) => {
      this.ngZone.runOutsideAngular(async () => {
        try {
          const { data, error } = await this.supabase
            .from('notificaciones')
            .update({ leida: true, fecha_lectura: this.timezoneService.getCurrentDateISO() })
            .eq('id', id)
            .select()
            .single();
          
          this.ngZone.run(() => {
            if (error) {
              reject(error);
            } else {
              resolve(data as Notificacion);
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
   * Elimina una notificación
   */
  async deleteNotificacion(id: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ngZone.runOutsideAngular(async () => {
        try {
          const { error } = await this.supabase
            .from('notificaciones')
            .delete()
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
