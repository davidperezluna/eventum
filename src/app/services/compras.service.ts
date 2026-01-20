/* ============================================
   COMPRAS SERVICE
   ============================================ */

import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Compra, CompraFilters, PaginatedResponse } from '../types';

@Injectable({
  providedIn: 'root'
})
export class ComprasService {
  constructor(
    private supabase: SupabaseService
  ) {}
  private tableName = 'compras';

  /**
   * Obtiene todas las compras con filtros opcionales
   * Incluye datos enriquecidos de cliente y evento
   */
  async getCompras(filters?: CompraFilters): Promise<PaginatedResponse<Compra>> {
    try {
      // Incluir relaciones con usuarios (cliente) y eventos (con lugar anidado)
      let query = this.supabase
        .from(this.tableName)
        .select(`
          *,
          cliente:usuarios(id, nombre, apellido, email, telefono),
          evento:eventos(
            id, 
            titulo, 
            fecha_inicio, 
            lugar_id,
            lugar:lugares(id, nombre, direccion, ciudad, pais, telefono, email)
          ),
          cupon:cupones_descuento(id, codigo, porcentaje_descuento)
        `, { count: 'exact' });

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
      if (filters?.search) {
        // Buscar por número de transacción
        query = query.ilike('numero_transaccion', `%${filters.search}%`);
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

      const { data, error, count } = await query;
      
      if (error) {
        console.error('Error en getCompras:', error);
        throw error;
      }
      
      const total = count || 0;
      const compras = (data as Compra[]) || [];
      console.log('Compras cargadas:', compras.length, 'de', total);
      
      return {
        data: compras,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Obtiene una compra por ID
   */
  async getCompraById(id: number): Promise<Compra> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data as Compra;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Crea una nueva compra
   */
  async createCompra(compra: Partial<Compra>): Promise<Compra> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .insert(compra)
        .select()
        .single();
      
      if (error) throw error;
      return data as Compra;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Actualiza una compra
   */
  async updateCompra(id: number, compra: Partial<Compra>): Promise<Compra> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .update(compra)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data as Compra;
    } catch (error) {
      throw error;
    }
  }
}
