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
      // Con solo_palcos: !inner en alias filtra padres con palco, y boletas_compradas
      // sigue trayendo todas las boletas (para detectar Mixto).
      const boletasSelect = filters?.solo_palcos
        ? `
          boletas_compradas(
            id,
            grupo_palco_id,
            palco_id,
            tipo_boleta_id,
            palcos(numero),
            tipos_boleta(nombre)
          ),
          _filtro_palco:boletas_compradas!inner(id, grupo_palco_id)
        `
        : `
          boletas_compradas(
            id,
            grupo_palco_id,
            palco_id,
            tipo_boleta_id,
            palcos(numero),
            tipos_boleta(nombre)
          )
        `;

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
          cupon:cupones_descuento!compras_cupon_id_fkey(id, codigo, porcentaje_descuento),
          ${boletasSelect}
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
      if (filters?.solo_palcos) {
        query = query.not('_filtro_palco.grupo_palco_id', 'is', null);
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
      const compras = ((data as Compra[]) || []).map((row) => {
        const { _filtro_palco, ...compra } = row as Compra & { _filtro_palco?: unknown };
        return compra as Compra;
      });
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
      // Primero verificar que el registro existe
      const { data: existingData, error: checkError } = await this.supabase
        .from(this.tableName)
        .select('id')
        .eq('id', id)
        .single();
      
      if (checkError || !existingData) {
        throw new Error(`No se encontró la compra con ID ${id}`);
      }

      // Actualizar sin JOINs para evitar problemas con relaciones
      const { data, error } = await this.supabase
        .from(this.tableName)
        .update(compra)
        .eq('id', id)
        .select('*') // Seleccionar solo campos básicos, sin JOINs
        .single();
      
      if (error) {
        // Si falla el SELECT después del UPDATE, intentar obtener el registro de nuevo
        if (error.code === 'PGRST116') {
          const { data: retryData, error: retryError } = await this.supabase
            .from(this.tableName)
            .select('*')
            .eq('id', id)
            .single();
          
          if (retryError) throw retryError;
          return retryData as Compra;
        }
        throw error;
      }
      
      return data as Compra;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Elimina boletas de una venta vía RPC (solo administrador en BD).
   * Sin grupo: borra la compra completa. Con grupo: solo ese palco; borra la compra si no quedan boletas.
   */
  async adminEliminarVentaBoletas(compraId: number, grupoPalcoId?: string | null): Promise<void> {
    const { error } = await this.supabase.getClient().rpc('admin_eliminar_venta_boletas', {
      p_compra_id: compraId,
      p_grupo_palco_id: grupoPalcoId ?? null,
    });
    if (error) {
      throw error;
    }
  }
}
