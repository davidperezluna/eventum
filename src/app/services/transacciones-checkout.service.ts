import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { PaginatedResponse } from '../types';

export interface TransaccionCheckout {
  id: number;
  tipo: 'boletas' | 'productos' | 'mixto' | string;
  cliente_id: number;
  evento_id: number;
  compra_id?: number | null;
  compra_producto_id?: number | null;
  compra_cover_id?: number | null;
  numero_intento: string;
  wompi_transaction_id?: string | null;
  wompi_reference?: string | null;
  wompi_status?: string | null;
  estado: 'pendiente' | 'aprobada' | 'rechazada' | 'cancelada' | 'expirada' | 'error' | string;
  es_activa: boolean;
  materializado: boolean;
  total: number;
  moneda?: string | null;
  fecha_creacion?: string | null;
  fecha_actualizacion?: string | null;
  fecha_confirmacion?: string | null;
  fecha_cancelacion?: string | null;
  request_payload?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  cliente?: {
    id: number;
    nombre?: string | null;
    apellido?: string | null;
    email?: string | null;
    documento_identidad?: string | null;
  } | null;
  evento?: {
    id: number;
    titulo?: string | null;
  } | null;
  compra?: {
    id: number;
    numero_transaccion?: string | null;
  } | null;
  compra_producto?: {
    id: number;
    numero_pedido?: string | null;
  } | null;
  compra_cover?: {
    id: number;
    numero_transaccion?: string | null;
  } | null;
}

export interface TransaccionCheckoutFilters {
  tx_id?: number;
  page?: number;
  limit?: number;
  evento_id?: number;
  compra_id?: number;
  compra_producto_id?: number;
  tipo?: string;
  estado?: string;
  search?: string;
}

interface TransaccionCheckoutRow {
  id: number;
  tipo: string;
  cliente_id: number;
  evento_id: number;
  compra_id?: number | null;
  compra_producto_id?: number | null;
  compra_cover_id?: number | null;
  numero_intento: string;
  wompi_transaction_id?: string | null;
  wompi_reference?: string | null;
  wompi_status?: string | null;
  estado: string;
  es_activa: boolean;
  materializado: boolean;
  total: number;
  moneda?: string | null;
  fecha_creacion?: string | null;
  fecha_actualizacion?: string | null;
  fecha_confirmacion?: string | null;
  fecha_cancelacion?: string | null;
  request_payload?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  cliente?:
    | {
        id: number;
        nombre?: string | null;
        apellido?: string | null;
        email?: string | null;
        documento_identidad?: string | null;
      }
    | Array<{
        id: number;
        nombre?: string | null;
        apellido?: string | null;
        email?: string | null;
        documento_identidad?: string | null;
      }>
    | null;
  evento?:
    | {
        id: number;
        titulo?: string | null;
      }
    | Array<{
        id: number;
        titulo?: string | null;
      }>
    | null;
  compra?:
    | {
        id: number;
        numero_transaccion?: string | null;
      }
    | Array<{
        id: number;
        numero_transaccion?: string | null;
      }>
    | null;
  compra_producto?:
    | {
        id: number;
        numero_pedido?: string | null;
      }
    | Array<{
        id: number;
        numero_pedido?: string | null;
      }>
    | null;
  compra_cover?:
    | {
        id: number;
        numero_transaccion?: string | null;
      }
    | Array<{
        id: number;
        numero_transaccion?: string | null;
      }>
    | null;
}

@Injectable({
  providedIn: 'root',
})
export class TransaccionesCheckoutService {
  constructor(private supabase: SupabaseService) {}

  private normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
    if (!value) {
      return null;
    }
    return Array.isArray(value) ? (value[0] ?? null) : value;
  }

  async getTransacciones(filters?: TransaccionCheckoutFilters): Promise<PaginatedResponse<TransaccionCheckout>> {
    let query = this.supabase
      .from('transacciones_checkout')
      .select(
        `
          id,
          tipo,
          cliente_id,
          evento_id,
          compra_id,
          compra_producto_id,
          compra_cover_id,
          numero_intento,
          wompi_transaction_id,
          wompi_reference,
          wompi_status,
          estado,
          es_activa,
          materializado,
          total,
          moneda,
          fecha_creacion,
          fecha_actualizacion,
          fecha_confirmacion,
          fecha_cancelacion,
          request_payload,
          metadata,
          cliente:usuarios(id, nombre, apellido, email, documento_identidad),
          evento:eventos(id, titulo),
          compra:compras(id, numero_transaccion),
          compra_producto:compras_productos(id, numero_pedido),
          compra_cover:compras_cover(id, numero_transaccion)
        `,
        { count: 'exact' }
      );

    if (filters?.evento_id) {
      query = query.eq('evento_id', filters.evento_id);
    }
    if (filters?.tx_id) {
      query = query.eq('id', filters.tx_id);
    }
    if (filters?.compra_id) {
      query = query.eq('compra_id', filters.compra_id);
    }
    if (filters?.compra_producto_id) {
      query = query.eq('compra_producto_id', filters.compra_producto_id);
    }
    if (filters?.tipo) {
      query = query.eq('tipo', filters.tipo);
    }
    if (filters?.estado) {
      query = query.eq('estado', filters.estado);
    }

    const search = filters?.search?.trim();
    if (search) {
      const compraIds = await this.buscarCompraIdsPorTransaccion(search);
      const orParts = [
        `numero_intento.ilike.%${search}%`,
        `wompi_reference.ilike.%${search}%`,
        `wompi_transaction_id.ilike.%${search}%`,
      ];
      if (compraIds.boletas.length > 0) {
        orParts.push(`compra_id.in.(${compraIds.boletas.join(',')})`);
      }
      if (compraIds.productos.length > 0) {
        orParts.push(`compra_producto_id.in.(${compraIds.productos.join(',')})`);
      }
      if (compraIds.covers.length > 0) {
        orParts.push(`compra_cover_id.in.(${compraIds.covers.join(',')})`);
      }
      query = query.or(orParts.join(','));
    }

    query = query.order('fecha_creacion', { ascending: false });

    const page = filters?.page || 1;
    const limit = filters?.limit || 15;
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) {
      throw error;
    }

    const rows = (data || []) as TransaccionCheckoutRow[];
    const normalizedData: TransaccionCheckout[] = rows.map((row) => ({
      ...row,
      cliente: this.normalizeRelation(row.cliente),
      evento: this.normalizeRelation(row.evento),
      compra: this.normalizeRelation(row.compra),
      compra_producto: this.normalizeRelation(row.compra_producto),
      compra_cover: this.normalizeRelation(row.compra_cover),
    }));

    const total = count || 0;
    return {
      data: normalizedData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getCompraIdsConCheckout(compraIds: number[]): Promise<Set<number>> {
    const ids = Array.from(new Set(compraIds.filter((id) => Number.isInteger(id) && id > 0)));
    if (ids.length === 0) {
      return new Set<number>();
    }

    const { data, error } = await this.supabase
      .from('transacciones_checkout')
      .select('compra_id')
      .in('compra_id', ids);

    if (error) {
      throw error;
    }

    const set = new Set<number>();
    for (const row of data || []) {
      const compraId = Number((row as Record<string, unknown>)['compra_id']);
      if (Number.isInteger(compraId) && compraId > 0) {
        set.add(compraId);
      }
    }
    return set;
  }

  async getCompraProductoIdsConCheckout(compraProductoIds: number[]): Promise<Set<number>> {
    const ids = Array.from(
      new Set(compraProductoIds.filter((id) => Number.isInteger(id) && id > 0))
    );
    if (ids.length === 0) {
      return new Set<number>();
    }

    const { data, error } = await this.supabase
      .from('transacciones_checkout')
      .select('compra_producto_id')
      .in('compra_producto_id', ids);

    if (error) {
      throw error;
    }

    const set = new Set<number>();
    for (const row of data || []) {
      const compraProductoId = Number((row as Record<string, unknown>)['compra_producto_id']);
      if (Number.isInteger(compraProductoId) && compraProductoId > 0) {
        set.add(compraProductoId);
      }
    }
    return set;
  }

  private async buscarCompraIdsPorTransaccion(search: string): Promise<{
    boletas: number[];
    productos: number[];
    covers: number[];
  }> {
    const empty = { boletas: [] as number[], productos: [] as number[], covers: [] as number[] };
    const term = search.trim();
    if (!term) {
      return empty;
    }

    try {
      const [boletasRes, productosRes, coversRes] = await Promise.all([
        this.supabase
          .from('compras')
          .select('id')
          .ilike('numero_transaccion', `%${term}%`)
          .limit(50),
        this.supabase
          .from('compras_productos')
          .select('id')
          .ilike('numero_pedido', `%${term}%`)
          .limit(50),
        this.supabase
          .from('compras_cover')
          .select('id')
          .ilike('numero_transaccion', `%${term}%`)
          .limit(50),
      ]);

      return {
        boletas: (boletasRes.data || [])
          .map((r) => Number((r as { id?: number }).id))
          .filter((id) => Number.isInteger(id) && id > 0),
        productos: (productosRes.data || [])
          .map((r) => Number((r as { id?: number }).id))
          .filter((id) => Number.isInteger(id) && id > 0),
        covers: (coversRes.data || [])
          .map((r) => Number((r as { id?: number }).id))
          .filter((id) => Number.isInteger(id) && id > 0),
      };
    } catch (error) {
      console.warn('No se pudo buscar compras por número de transacción:', error);
      return empty;
    }
  }

  async getNombresTiposBoleta(ids: number[]): Promise<Map<number, string>> {
    const uniques = Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0)));
    if (uniques.length === 0) {
      return new Map<number, string>();
    }

    const { data, error } = await this.supabase
      .from('tipos_boleta')
      .select('id, nombre')
      .in('id', uniques);

    if (error) {
      throw error;
    }

    const map = new Map<number, string>();
    for (const row of data || []) {
      const id = Number((row as Record<string, unknown>)['id']);
      const nombre = String((row as Record<string, unknown>)['nombre'] || '').trim();
      if (id > 0 && nombre) {
        map.set(id, nombre);
      }
    }
    return map;
  }

  async getNombresProductos(ids: number[]): Promise<Map<number, string>> {
    const uniques = Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0)));
    if (uniques.length === 0) {
      return new Map<number, string>();
    }

    const { data, error } = await this.supabase
      .from('productos')
      .select('id, nombre')
      .in('id', uniques);

    if (error) {
      throw error;
    }

    const map = new Map<number, string>();
    for (const row of data || []) {
      const id = Number((row as Record<string, unknown>)['id']);
      const nombre = String((row as Record<string, unknown>)['nombre'] || '').trim();
      if (id > 0 && nombre) {
        map.set(id, nombre);
      }
    }
    return map;
  }
}
