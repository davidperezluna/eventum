import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { TimezoneService } from './timezone.service';
import { PaginatedResponse, Producto, ProductoFilters } from '../types';

@Injectable({
  providedIn: 'root'
})
export class ProductosService {
  constructor(
    private supabase: SupabaseService,
    private timezoneService: TimezoneService
  ) {}

  async getProductosPorEvento(eventoId: number, soloActivos = true): Promise<Producto[]> {
    let query = this.supabase
      .from('productos')
      .select('*')
      .eq('evento_id', eventoId)
      .order('orden', { ascending: true })
      .order('precio', { ascending: true });

    if (soloActivos) {
      query = query.eq('activo', true);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }
    return (data as Producto[]) || [];
  }

  async getProductos(filters: ProductoFilters = {}): Promise<PaginatedResponse<Producto>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase
      .from('productos')
      .select('*, eventos(id, titulo)', { count: 'exact' })
      .order('fecha_creacion', { ascending: false })
      .range(from, to);

    if (filters.evento_id != null) {
      query = query.eq('evento_id', filters.evento_id);
    }
    if (filters.activo != null) {
      query = query.eq('activo', filters.activo);
    }
    if (filters.es_licor != null) {
      query = query.eq('es_licor', filters.es_licor);
    }
    if (filters.search?.trim()) {
      query = query.ilike('nombre', `%${filters.search.trim()}%`);
    }

    const { data, error, count } = await query;
    if (error) {
      throw error;
    }

    const total = count ?? 0;
    return {
      data: (data as Producto[]) || [],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1
    };
  }

  async getProductoById(id: number): Promise<Producto> {
    const { data, error } = await this.supabase
      .from('productos')
      .select('*, eventos(id, titulo)')
      .eq('id', id)
      .single();

    if (error) {
      throw error;
    }
    return data as Producto;
  }

  async createProducto(producto: Partial<Producto>): Promise<Producto> {
    const payload = {
      ...producto,
      cantidad_vendidas: producto.cantidad_vendidas ?? 0,
      fecha_creacion: this.timezoneService.getCurrentDateISO(),
      fecha_actualizacion: this.timezoneService.getCurrentDateISO()
    };

    const { data, error } = await this.supabase
      .from('productos')
      .insert(payload)
      .select()
      .single();

    if (error) {
      throw error;
    }
    return data as Producto;
  }

  async updateProducto(id: number, producto: Partial<Producto>): Promise<Producto> {
    const { data, error } = await this.supabase
      .from('productos')
      .update({
        ...producto,
        fecha_actualizacion: this.timezoneService.getCurrentDateISO()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }
    return data as Producto;
  }

  async deleteProducto(id: number): Promise<void> {
    const { error } = await this.supabase.from('productos').delete().eq('id', id);
    if (error) {
      throw error;
    }
  }

  /** Indica si hay al menos un producto activo en venta para el evento. */
  async eventoTieneProductos(eventoId: number): Promise<boolean> {
    const { count, error } = await this.supabase
      .from('productos')
      .select('id', { count: 'exact', head: true })
      .eq('evento_id', eventoId)
      .eq('activo', true);

    if (error) {
      console.warn('eventoTieneProductos:', error);
      return false;
    }
    return (count ?? 0) > 0;
  }
}
