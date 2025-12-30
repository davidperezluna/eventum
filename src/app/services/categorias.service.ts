/* ============================================
   CATEGORIAS SERVICE
   ============================================ */

import { Injectable } from '@angular/core';
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
  ) { }

  /**
   * Obtiene todas las categorías
   */
  async getCategorias(filters?: CategoriaFilters): Promise<PaginatedResponse<CategoriaEvento>> {
    try {
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

      const response = await query;

      if (response.error) {
        console.error('Error en getCategorias:', response.error);
        throw response.error;
      }

      const total = response.count || 0;
      const categorias = (response.data as CategoriaEvento[]) || [];
      console.log('Categorías cargadas:', categorias.length, 'de', total);

      return {
        data: categorias,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      console.error('Error en getCategorias:', error);
      throw error;
    }
  }

  /**
   * Obtiene una categoría por ID
   */
  async getCategoriaById(id: number): Promise<CategoriaEvento> {
    try {
      const response = await this.supabase
        .from('categorias_evento')
        .select('*')
        .eq('id', id)
        .single();

      if (response.error) {
        console.error('Error en getCategoriaById:', response.error);
        throw response.error;
      }

      if (!response.data) {
        throw new Error(`Categoría con ID ${id} no encontrada`);
      }

      return response.data as CategoriaEvento;
    } catch (error) {
      console.error('Error catch en getCategoriaById:', error);
      throw error;
    }
  }

  /**
   * Crea una nueva categoría
   */
  async createCategoria(categoria: Partial<CategoriaEvento>): Promise<CategoriaEvento> {
    try {
      const response = await this.supabase
        .from('categorias_evento')
        .insert(categoria)
        .select()
        .single();

      if (response.error) {
        throw response.error;
      }

      return response.data as CategoriaEvento;
    } catch (error) {
      console.error('Error en createCategoria:', error);
      throw error;
    }
  }

  /**
   * Actualiza una categoría
   */
  async updateCategoria(id: number, categoria: Partial<CategoriaEvento>): Promise<CategoriaEvento> {
    try {
      const response = await this.supabase
        .from('categorias_evento')
        .update(categoria)
        .eq('id', id)
        .select()
        .single();

      if (response.error) {
        throw response.error;
      }

      return response.data as CategoriaEvento;
    } catch (error) {
      console.error('Error en updateCategoria:', error);
      throw error;
    }
  }

  /**
   * Elimina una categoría (soft delete)
   */
  async deleteCategoria(id: number): Promise<void> {
    try {
      const response = await this.supabase
        .from('categorias_evento')
        .update({ activo: false })
        .eq('id', id);

      if (response.error) {
        throw response.error;
      }
    } catch (error) {
      console.error('Error en deleteCategoria:', error);
      throw error;
    }
  }
}
