/* ============================================
   NOTIFICACIONES SERVICE
   ============================================ */

import { Injectable, NgZone } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
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
    private ngZone: NgZone
  ) {}

  /**
   * Obtiene todas las notificaciones
   */
  getNotificaciones(filters?: NotificacionFilters): Observable<PaginatedResponse<Notificacion>> {
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

    return new Observable(observer => {
      this.ngZone.runOutsideAngular(async () => {
        try {
          const { data, error, count } = await query;
          this.ngZone.run(() => {
            if (error) {
              console.error('Error en getNotificaciones:', error);
              observer.error(error);
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
            
            console.log('Enviando respuesta al observer:', response);
            observer.next(response);
            observer.complete();
            console.log('Observer completado en notificaciones');
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
   * Crea una nueva notificación
   */
  createNotificacion(notificacion: Partial<Notificacion>): Observable<Notificacion> {
    return new Observable(observer => {
      this.ngZone.runOutsideAngular(async () => {
        try {
          const { data, error } = await this.supabase
            .from('notificaciones')
            .insert(notificacion)
            .select()
            .single();
          
          this.ngZone.run(() => {
            if (error) {
              observer.error(error);
            } else {
              observer.next(data as Notificacion);
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
   * Crea notificaciones masivas para múltiples usuarios
   */
  createNotificacionesMasivas(usuarioIds: number[], titulo: string, mensaje: string, tipo?: TipoTipoNotificacion): Observable<Notificacion[]> {
    const notificaciones = usuarioIds.map(usuario_id => ({
      usuario_id,
      titulo,
      mensaje,
      tipo: tipo || TipoTipoNotificacion.INFO
    }));

    return new Observable(observer => {
      this.ngZone.runOutsideAngular(async () => {
        try {
          const { data, error } = await this.supabase
            .from('notificaciones')
            .insert(notificaciones)
            .select();
          
          this.ngZone.run(() => {
            if (error) {
              observer.error(error);
            } else {
              observer.next((data as Notificacion[]) || []);
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
   * Marca una notificación como leída
   */
  marcarComoLeida(id: number): Observable<Notificacion> {
    return new Observable(observer => {
      this.ngZone.runOutsideAngular(async () => {
        try {
          const { data, error } = await this.supabase
            .from('notificaciones')
            .update({ leida: true, fecha_lectura: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
          
          this.ngZone.run(() => {
            if (error) {
              observer.error(error);
            } else {
              observer.next(data as Notificacion);
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
   * Elimina una notificación
   */
  deleteNotificacion(id: number): Observable<void> {
    return new Observable(observer => {
      this.ngZone.runOutsideAngular(async () => {
        try {
          const { error } = await this.supabase
            .from('notificaciones')
            .delete()
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
