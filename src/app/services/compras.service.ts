/* ============================================
   COMPRAS SERVICE
   ============================================ */

import { Injectable, NgZone } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { Compra, CompraFilters, PaginatedResponse } from '../types';

@Injectable({
  providedIn: 'root'
})
export class ComprasService {
  constructor(
    private supabase: SupabaseService,
    private ngZone: NgZone
  ) {}
  private tableName = 'compras';

  /**
   * Obtiene todas las compras con filtros opcionales
   */
  getCompras(filters?: CompraFilters): Observable<PaginatedResponse<Compra>> {
    let query = this.supabase.from(this.tableName).select('*', { count: 'exact' });

    // Aplicar filtros
    if (filters?.cliente_id) {
      query = query.eq('cliente_id', filters.cliente_id);
    }
    if (filters?.evento_id) {
      query = query.eq('evento_id', filters.evento_id);
    }
    if (filters?.estado_pago) {
      query = query.eq('estado_pago', filters.estado_pago);
    }
    if (filters?.estado_compra) {
      query = query.eq('estado_compra', filters.estado_compra);
    }
    if (filters?.fecha_desde) {
      query = query.gte('fecha_compra', filters.fecha_desde);
    }
    if (filters?.fecha_hasta) {
      query = query.lte('fecha_compra', filters.fecha_hasta);
    }

    // Ordenamiento
    const sortBy = filters?.sortBy || 'fecha_compra';
    const sortOrder = filters?.sortOrder || 'desc';
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    // Paginación
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
              console.error('Error en getCompras:', error);
              observer.error(error);
              return;
            }
            
            const total = count || 0;
            const compras = (data as Compra[]) || [];
            console.log('Compras cargadas:', compras.length, 'de', total);
            console.log('Datos de compras:', compras);
            
            const response: PaginatedResponse<Compra> = {
              data: compras,
              total,
              page,
              limit,
              totalPages: Math.ceil(total / limit)
            };
            
            console.log('Enviando respuesta al observer:', response);
            observer.next(response);
            observer.complete();
            console.log('Observer completado en compras');
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
   * Obtiene una compra por ID
   */
  getCompraById(id: number): Observable<Compra> {
    return new Observable(observer => {
      this.ngZone.runOutsideAngular(async () => {
        try {
          const { data, error } = await this.supabase
            .from(this.tableName)
            .select('*')
            .eq('id', id)
            .single();
          
          this.ngZone.run(() => {
            if (error) {
              observer.error(error);
            } else {
              observer.next(data as Compra);
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
   * Crea una nueva compra
   */
  createCompra(compra: Partial<Compra>): Observable<Compra> {
    return new Observable(observer => {
      this.ngZone.runOutsideAngular(async () => {
        try {
          const { data, error } = await this.supabase
            .from(this.tableName)
            .insert(compra)
            .select()
            .single();
          
          this.ngZone.run(() => {
            if (error) {
              observer.error(error);
            } else {
              observer.next(data as Compra);
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
   * Actualiza una compra
   */
  updateCompra(id: number, compra: Partial<Compra>): Observable<Compra> {
    return new Observable(observer => {
      this.ngZone.runOutsideAngular(async () => {
        try {
          const { data, error } = await this.supabase
            .from(this.tableName)
            .update(compra)
            .eq('id', id)
            .select()
            .single();
          
          this.ngZone.run(() => {
            if (error) {
              observer.error(error);
            } else {
              observer.next(data as Compra);
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
