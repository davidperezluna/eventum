/* ============================================
   BOLETAS SERVICE
   ============================================ */

import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { TimezoneService } from './timezone.service';
import { BoletaComprada, TipoBoleta, BoletaFilters, PaginatedResponse } from '../types';

@Injectable({
  providedIn: 'root'
})
export class BoletasService {
  constructor(
    private supabase: SupabaseService,
    private timezoneService: TimezoneService
  ) {}

  /**
   * Obtiene todas las boletas compradas con filtros opcionales
   * Incluye información del estado de pago de la compra
   */
  async getBoletasCompradas(filters?: BoletaFilters): Promise<PaginatedResponse<BoletaComprada>> {
    let query = this.supabase.from('boletas_compradas')
      .select('*, compras(estado_pago, estado_compra, evento_id, eventos(titulo, fecha_inicio, lugar_id)), tipos_boleta(evento_id, eventos(id, titulo, fecha_inicio, lugar_id))', { count: 'exact' });

    // Aplicar filtros
    if (filters?.compra_id) {
      query = query.eq('compra_id', filters.compra_id);
    }
    if (filters?.tipo_boleta_id) {
      query = query.eq('tipo_boleta_id', filters.tipo_boleta_id);
    }
    // Si hay filtro por evento_id pero no por tipo_boleta_id, necesitamos filtrar por los tipos del evento
    if (filters?.evento_id && !filters?.tipo_boleta_id) {
      try {
        // Primero obtener los tipos de boleta del evento
        const tiposResponse = await this.supabase
          .from('tipos_boleta')
          .select('id')
          .eq('evento_id', filters.evento_id);
        
        if (tiposResponse.error) {
          throw tiposResponse.error;
        }
        
        const tipoIds = (tiposResponse.data as { id: number }[]).map(t => t.id);
        
        if (tipoIds.length === 0) {
          // Si no hay tipos, retornar vacío
          return {
            data: [],
            total: 0,
            page: filters?.page || 1,
            limit: filters?.limit || 10,
            totalPages: 0
          };
        }
        
        // Ahora filtrar boletas por esos tipos
        let boletasQuery = this.supabase
          .from('boletas_compradas')
          .select('*, compras(estado_pago, estado_compra, evento_id, eventos(titulo, fecha_inicio, lugar_id)), tipos_boleta(evento_id, eventos(id, titulo, fecha_inicio, lugar_id))', { count: 'exact' })
          .in('tipo_boleta_id', tipoIds);
        
        // Aplicar otros filtros
        if (filters?.estado) {
          boletasQuery = boletasQuery.eq('estado', filters.estado);
        }
        if (filters?.codigo_qr) {
          boletasQuery = boletasQuery.ilike('codigo_qr', `%${filters.codigo_qr}%`);
        }
        if (filters?.nombre_asistente) {
          boletasQuery = boletasQuery.ilike('nombre_asistente', `%${filters.nombre_asistente}%`);
        }
        if (filters?.email_asistente) {
          boletasQuery = boletasQuery.ilike('email_asistente', `%${filters.email_asistente}%`);
        }
        if (filters?.telefono_asistente) {
          boletasQuery = boletasQuery.ilike('telefono_asistente', `%${filters.telefono_asistente}%`);
        }
        if (filters?.fecha_desde) {
          boletasQuery = boletasQuery.gte('fecha_creacion', filters.fecha_desde);
        }
        if (filters?.fecha_hasta) {
          boletasQuery = boletasQuery.lte('fecha_creacion', filters.fecha_hasta);
        }
        if (filters?.documento_asistente) {
          boletasQuery = boletasQuery.ilike('documento_asistente', `%${filters.documento_asistente}%`);
        }
        if (filters?.search) {
          const searchTerm = `%${filters.search}%`;
          boletasQuery = boletasQuery.or(`codigo_qr.ilike.${searchTerm},nombre_asistente.ilike.${searchTerm},email_asistente.ilike.${searchTerm}`);
        }
        
        // Ordenamiento
        const sortBy = filters?.sortBy || 'fecha_creacion';
        const sortOrder = filters?.sortOrder || 'desc';
        boletasQuery = boletasQuery.order(sortBy, { ascending: sortOrder === 'asc' });
        
        // Paginación
        const page = filters?.page || 1;
        const limit = filters?.limit || 10;
        const fromIndex = (page - 1) * limit;
        const toIndex = fromIndex + limit - 1;
        boletasQuery = boletasQuery.range(fromIndex, toIndex);
        
        const boletasResponse = await boletasQuery;
        
        if (boletasResponse.error) {
          console.error('Error en getBoletasCompradas:', boletasResponse.error);
          throw boletasResponse.error;
        }
        
        const total = boletasResponse.count || 0;
        const boletas = ((boletasResponse.data as any[]) || []).map(boleta => 
          this.normalizarBoletaConCompra(boleta)
        );
        console.log('Boletas cargadas:', boletas.length, 'de', total);
        
        return {
          data: boletas,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        };
      } catch (error) {
        console.error('Error en getBoletasCompradas:', error);
        throw error;
      }
    }
    
    if (filters?.estado) {
      query = query.eq('estado', filters.estado);
    }
    if (filters?.codigo_qr) {
      query = query.ilike('codigo_qr', `%${filters.codigo_qr}%`);
    }
    if (filters?.nombre_asistente) {
      query = query.ilike('nombre_asistente', `%${filters.nombre_asistente}%`);
    }
    if (filters?.email_asistente) {
      query = query.ilike('email_asistente', `%${filters.email_asistente}%`);
    }
    if (filters?.telefono_asistente) {
      query = query.ilike('telefono_asistente', `%${filters.telefono_asistente}%`);
    }
    if (filters?.fecha_desde) {
      query = query.gte('fecha_creacion', filters.fecha_desde);
    }
    if (filters?.fecha_hasta) {
      query = query.lte('fecha_creacion', filters.fecha_hasta);
    }
    // Búsqueda general (busca en código QR, nombre, email)
    if (filters?.search) {
      const searchTerm = `%${filters.search}%`;
      query = query.or(`codigo_qr.ilike.${searchTerm},nombre_asistente.ilike.${searchTerm},email_asistente.ilike.${searchTerm}`);
    }

    // Ordenamiento
    const sortBy = filters?.sortBy || 'fecha_creacion';
    const sortOrder = filters?.sortOrder || 'desc';
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    // Paginación
    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const fromIndex = (page - 1) * limit;
    const toIndex = fromIndex + limit - 1;
    query = query.range(fromIndex, toIndex);

    try {
      const response = await query;
      
      if (response.error) {
        console.error('Error en getBoletasCompradas:', response.error);
        throw response.error;
      }
      
      const total = response.count || 0;
      const boletas = ((response.data as any[]) || []).map(boleta => 
        this.normalizarBoletaConCompra(boleta)
      );
      console.log('Boletas cargadas:', boletas.length, 'de', total);
      
      return {
        data: boletas,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      console.error('Error en getBoletasCompradas:', error);
      throw error;
    }
  }

  /**
   * Obtiene los tipos de boleta de un evento
   */
  async getTiposBoleta(eventoId: number): Promise<TipoBoleta[]> {
    try {
      const response = await this.supabase
        .from('tipos_boleta')
        .select('*')
        .eq('evento_id', eventoId)
        .eq('activo', true)
        .order('precio', { ascending: true });
      
      if (response.error) {
        throw response.error;
      }
      
      return (response.data as TipoBoleta[]) || [];
    } catch (error) {
      console.error('Error en getTiposBoleta:', error);
      throw error;
    }
  }

  /**
   * Crea un nuevo tipo de boleta
   */
  async createTipoBoleta(tipoBoleta: Partial<TipoBoleta>): Promise<TipoBoleta> {
    try {
      const response = await this.supabase
        .from('tipos_boleta')
        .insert({
          ...tipoBoleta,
          fecha_creacion: this.timezoneService.getCurrentDateISO()
        })
        .select()
        .single();
      
      if (response.error) {
        throw response.error;
      }
      
      return response.data as TipoBoleta;
    } catch (error) {
      console.error('Error en createTipoBoleta:', error);
      throw error;
    }
  }

  /**
   * Actualiza un tipo de boleta
   */
  async updateTipoBoleta(id: number, tipoBoleta: Partial<TipoBoleta>): Promise<TipoBoleta> {
    try {
      const response = await this.supabase
        .from('tipos_boleta')
        .update(tipoBoleta)
        .eq('id', id)
        .select()
        .single();
      
      if (response.error) {
        throw response.error;
      }
      
      return response.data as TipoBoleta;
    } catch (error) {
      console.error('Error en updateTipoBoleta:', error);
      throw error;
    }
  }

  /**
   * Obtiene un tipo de boleta por ID
   */
  async getTipoBoletaById(id: number): Promise<TipoBoleta> {
    try {
      const response = await this.supabase
        .from('tipos_boleta')
        .select('*')
        .eq('id', id)
        .single();
      
      if (response.error) {
        throw response.error;
      }
      
      return response.data as TipoBoleta;
    } catch (error) {
      console.error('Error en getTipoBoletaById:', error);
      throw error;
    }
  }

  /**
   * Obtiene todos los tipos de boleta con filtros opcionales
   */
  async getAllTiposBoleta(filters?: { evento_id?: number; activo?: boolean }): Promise<TipoBoleta[]> {
    try {
      let query = this.supabase.from('tipos_boleta').select('*');
      
      if (filters?.evento_id) {
        query = query.eq('evento_id', filters.evento_id);
      }
      if (filters?.activo !== undefined) {
        query = query.eq('activo', filters.activo);
      }
      
      query = query.order('fecha_creacion', { ascending: false });
      
      const response = await query;
      
      if (response.error) {
        throw response.error;
      }
      
      const tipos = (response.data as TipoBoleta[]) || [];
      
      // Enriquecer con información de boletas vendidas
      const tiposConVendidas = await Promise.all(
        tipos.map(async (tipo) => {
          const cantidadVendidas = await this.getCantidadBoletasVendidas(tipo.id);
          return {
            ...tipo,
            cantidad_vendidas: cantidadVendidas
          };
        })
      );
      
      return tiposConVendidas;
    } catch (error) {
      console.error('Error en getAllTiposBoleta:', error);
      throw error;
    }
  }

  /**
   * Obtiene la cantidad de boletas vendidas para un tipo de boleta
   * (solo cuenta boletas con pago completado)
   */
  async getCantidadBoletasVendidas(tipoBoletaId: number): Promise<number> {
    try {
      const { count, error } = await this.supabase
        .from('boletas_compradas')
        .select('*, compras!inner(estado_pago)', { count: 'exact', head: true })
        .eq('tipo_boleta_id', tipoBoletaId)
        .eq('compras.estado_pago', 'completado');
      
      if (error) {
        console.error('Error obteniendo cantidad de boletas vendidas:', error);
        return 0;
      }
      
      return count || 0;
    } catch (error) {
      console.error('Error en getCantidadBoletasVendidas:', error);
      return 0;
    }
  }

  /**
   * Valida una boleta (cambia su estado a 'usada')
   */
  async validarBoleta(boletaId: number): Promise<BoletaComprada> {
    try {
      const response = await this.supabase
        .from('boletas_compradas')
        .update({ 
          estado: 'usada',
          fecha_uso: this.timezoneService.getCurrentDateISO()
        })
        .eq('id', boletaId)
        .select()
        .single();
      
      if (response.error) {
        throw response.error;
      }
      
      return response.data as BoletaComprada;
    } catch (error) {
      console.error('Error en validarBoleta:', error);
      throw error;
    }
  }

  /**
   * Busca una boleta por código QR
   * Incluye información del estado de pago de la compra
   */
  async buscarBoletaPorCodigoQR(codigoQR: string): Promise<BoletaComprada | null> {
    try {
      const response = await this.supabase
        .from('boletas_compradas')
        .select('*, compras(estado_pago, estado_compra, evento_id, eventos(titulo, fecha_inicio, lugar_id)), tipos_boleta(evento_id, eventos(id, titulo, fecha_inicio, lugar_id))')
        .eq('codigo_qr', codigoQR)
        .single();
      
      if (response.error) {
        // Si no se encuentra, retornar null en lugar de lanzar error
        if (response.error.code === 'PGRST116') {
          return null;
        }
        throw response.error;
      }
      
      const boleta = this.normalizarBoletaConCompra(response.data);
      return boleta;
    } catch (error) {
      console.error('Error en buscarBoletaPorCodigoQR:', error);
      throw error;
    }
  }

  /**
   * Busca boletas por documento del asistente
   * Incluye información del estado de pago de la compra
   */
  async buscarBoletasPorDocumento(documento: string): Promise<BoletaComprada[]> {
    try {
      const response = await this.supabase
        .from('boletas_compradas')
        .select('*, compras(estado_pago, estado_compra, evento_id, eventos(titulo, fecha_inicio, lugar_id)), tipos_boleta(evento_id, eventos(id, titulo, fecha_inicio, lugar_id))')
        .ilike('documento_asistente', `%${documento}%`)
        .order('fecha_creacion', { ascending: false });
      
      if (response.error) {
        throw response.error;
      }
      
      const boletas = ((response.data as any[]) || []).map(boleta => 
        this.normalizarBoletaConCompra(boleta)
      );
      
      return boletas;
    } catch (error) {
      console.error('Error en buscarBoletasPorDocumento:', error);
      throw error;
    }
  }

  /**
   * Normaliza una boleta para incluir estado_pago directamente desde la compra y información del evento
   */
  private normalizarBoletaConCompra(boleta: any): BoletaComprada {
    const boletaNormalizada = { ...boleta } as BoletaComprada;
    
    // Si viene el objeto compra, extraer estado_pago y estado_compra
    if (boleta.compras && Array.isArray(boleta.compras) && boleta.compras.length > 0) {
      const compra = boleta.compras[0];
      boletaNormalizada.estado_pago = compra.estado_pago;
      boletaNormalizada.compra = {
        id: boleta.compra_id,
        estado_pago: compra.estado_pago,
        estado_compra: compra.estado_compra
      };
      
      // Extraer información del evento desde la compra
      if (compra.eventos && !Array.isArray(compra.eventos)) {
        (boletaNormalizada as any).evento = compra.eventos;
      }
    } else if (boleta.compras && !Array.isArray(boleta.compras)) {
      // Si viene como objeto único (single select)
      const compra = boleta.compras;
      boletaNormalizada.estado_pago = compra.estado_pago;
      boletaNormalizada.compra = {
        id: boleta.compra_id,
        estado_pago: compra.estado_pago,
        estado_compra: compra.estado_compra
      };
      
      // Extraer información del evento desde la compra
      if (compra.eventos && !Array.isArray(compra.eventos)) {
        (boletaNormalizada as any).evento = compra.eventos;
      }
    }
    
    // También intentar obtener el evento desde tipos_boleta si no está en compra
    if (!(boletaNormalizada as any).evento && boleta.tipos_boleta) {
      const tipoBoleta = Array.isArray(boleta.tipos_boleta) ? boleta.tipos_boleta[0] : boleta.tipos_boleta;
      if (tipoBoleta?.eventos && !Array.isArray(tipoBoleta.eventos)) {
        (boletaNormalizada as any).evento = tipoBoleta.eventos;
      }
    }
    
    // Limpiar los objetos del join (ya los tenemos normalizados)
    delete (boletaNormalizada as any).compras;
    delete (boletaNormalizada as any).tipos_boleta;
    
    return boletaNormalizada;
  }
}
