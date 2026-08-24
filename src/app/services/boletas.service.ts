/* ============================================
   BOLETAS SERVICE
   ============================================ */

import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { TimezoneService } from './timezone.service';
import { AuthService } from './auth.service';
import { BoletaComprada, TipoBoleta, BoletaFilters, PaginatedResponse, Palco, EstadoPalco } from '../types';
import { normalizarDocumentoIdentidad } from '../core/documento-identidad';

@Injectable({
  providedIn: 'root'
})
export class BoletasService {
  /** Join estándar para listados y búsqueda de boletas (incluye meta del tipo para palcos). */
  private readonly selectBoletaConRelaciones =
    '*, validado_por:usuarios!boletas_compradas_validado_por_usuario_id_fkey(id, nombre, apellido, email), asistente_usuario:usuarios!asistente_usuario_id(id, nombre, apellido, email, telefono, documento_identidad), palcos(numero), compras(estado_pago, estado_compra, evento_id, cliente_id, numero_transaccion, eventos(id, titulo, fecha_inicio, fecha_fin, lugar_id, lugar:lugares(id, nombre, direccion, ciudad, pais)), cliente:usuarios(nombre, apellido, email, documento_identidad)), tipos_boleta(evento_id, nombre, personas_por_unidad, es_palco, eventos(id, titulo, fecha_inicio, fecha_fin, lugar_id, lugar:lugares(id, nombre, direccion, ciudad, pais)))';

  constructor(
    private supabase: SupabaseService,
    private timezoneService: TimezoneService,
    private authService: AuthService
  ) {}

  /** Vincula la boleta al usuario asistente (perfil Eventum). */
  async vincularAsistenteUsuario(boletaId: number, usuarioId: number): Promise<void> {
    const { error } = await this.supabase
      .from('boletas_compradas')
      .update({ asistente_usuario_id: usuarioId })
      .eq('id', boletaId);

    if (error) {
      throw error;
    }
  }

  private aplicarFiltrosAsistente<T extends { ilike: Function; or: Function; filter: Function }>(
    query: T,
    filters?: BoletaFilters
  ): T {
    if (filters?.nombre_asistente) {
      query = query.ilike('asistente_usuario.nombre', `%${filters.nombre_asistente}%`) as T;
    }
    if (filters?.email_asistente) {
      query = query.ilike('asistente_usuario.email', `%${filters.email_asistente}%`) as T;
    }
    if (filters?.telefono_asistente) {
      query = query.ilike('asistente_usuario.telefono', `%${filters.telefono_asistente}%`) as T;
    }
    if (filters?.documento_asistente) {
      query = query.ilike('asistente_usuario.documento_identidad', `%${filters.documento_asistente}%`) as T;
    }
    if (filters?.search) {
      const searchTerm = `%${filters.search}%`;
      query = query.or(
        `codigo_qr.ilike.${searchTerm},asistente_usuario.nombre.ilike.${searchTerm},asistente_usuario.email.ilike.${searchTerm}`
      ) as T;
    }
    return query;
  }

  /**
   * Obtiene todas las boletas compradas con filtros opcionales
   * Incluye información del estado de pago de la compra
   */
  async getBoletasCompradas(filters?: BoletaFilters): Promise<PaginatedResponse<BoletaComprada>> {
    let query = this.supabase.from('boletas_compradas')
      .select(this.selectBoletaConRelaciones, { count: 'exact' });

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
          .select(this.selectBoletaConRelaciones, { count: 'exact' })
          .in('tipo_boleta_id', tipoIds);
        
        // Aplicar otros filtros
        if (filters?.estado) {
          boletasQuery = boletasQuery.eq('estado', filters.estado);
        }
        if (filters?.codigo_qr) {
          boletasQuery = boletasQuery.ilike('codigo_qr', `%${filters.codigo_qr}%`);
        }
        boletasQuery = this.aplicarFiltrosAsistente(boletasQuery, filters);
        if (filters?.fecha_desde) {
          boletasQuery = boletasQuery.gte('fecha_creacion', filters.fecha_desde);
        }
        if (filters?.fecha_hasta) {
          boletasQuery = boletasQuery.lte('fecha_creacion', filters.fecha_hasta);
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
    query = this.aplicarFiltrosAsistente(query, filters);
    if (filters?.fecha_desde) {
      query = query.gte('fecha_creacion', filters.fecha_desde);
    }
    if (filters?.fecha_hasta) {
      query = query.lte('fecha_creacion', filters.fecha_hasta);
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
   * Boletas por ids (p. ej. enriquecer traslados pendientes).
   */
  async getBoletasByIds(ids: number[]): Promise<BoletaComprada[]> {
    const uniq = [...new Set(ids.filter((id) => id > 0))];
    if (uniq.length === 0) {
      return [];
    }
    const { data, error } = await this.supabase
      .from('boletas_compradas')
      .select(this.selectBoletaConRelaciones)
      .in('id', uniq);
    if (error) {
      console.error('getBoletasByIds:', error);
      throw error;
    }
    return ((data as any[]) || []).map((b) => this.normalizarBoletaConCompra(b));
  }

  /**
   * Entradas cuya titularidad te fue cedida (no eres el comprador original).
   */
  async getBoletasCedidasTitular(clienteId: number): Promise<BoletaComprada[]> {
    const { data, error } = await this.supabase
      .from('boletas_compradas')
      .select(this.selectBoletaConRelaciones)
      .eq('titular_cliente_id', clienteId);
    if (error) {
      console.error('getBoletasCedidasTitular:', error);
      throw error;
    }
    const rows = ((data as any[]) || []).map((b) => this.normalizarBoletaConCompra(b));
    return rows.filter((b) => (b.compra?.cliente_id ?? 0) !== clienteId);
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
   * Lista todos los palcos de un tipo (admin / diagnóstico).
   */
  async getPalcosPorTipo(tipoBoletaId: number): Promise<Palco[]> {
    try {
      const response = await this.supabase
        .from('palcos')
        .select('*')
        .eq('tipo_boleta_id', tipoBoletaId)
        .order('numero', { ascending: true });
      if (response.error) {
        throw response.error;
      }
      return (response.data as Palco[]) || [];
    } catch (error) {
      console.error('Error en getPalcosPorTipo:', error);
      throw error;
    }
  }

  /**
   * Palcos disponibles para compra (no reservados ni vendidos).
   */
  async getPalcosDisponiblesParaVenta(tipoBoletaId: number): Promise<Palco[]> {
    try {
      const response = await this.supabase
        .from('palcos')
        .select('*')
        .eq('tipo_boleta_id', tipoBoletaId)
        .eq('estado', EstadoPalco.DISPONIBLE)
        .order('numero', { ascending: true });
      if (response.error) {
        throw response.error;
      }
      return (response.data as Palco[]) || [];
    } catch (error) {
      console.error('Error en getPalcosDisponiblesParaVenta:', error);
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

      const created = response.data as TipoBoleta;
      await this.sincronizarRangoPrecioEvento(created.evento_id);
      return created;
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

      const updated = response.data as TipoBoleta;
      await this.sincronizarRangoPrecioEvento(updated.evento_id);
      return updated;
    } catch (error) {
      console.error('Error en updateTipoBoleta:', error);
      throw error;
    }
  }

  /** Mantiene el precio visible del evento derivado de sus tipos de boleta activos. */
  private async sincronizarRangoPrecioEvento(eventoId: number): Promise<void> {
    const { data: tipos, error: tiposError } = await this.supabase
      .from('tipos_boleta')
      .select('precio')
      .eq('evento_id', eventoId)
      .eq('activo', true);

    if (tiposError) throw tiposError;

    const precios = (tipos || [])
      .map((tipo) => Number(tipo.precio))
      .filter((precio) => Number.isFinite(precio) && precio >= 0);
    const rango = precios.length
      ? { precio_minimo: Math.min(...precios), precio_maximo: Math.max(...precios) }
      : { precio_minimo: null, precio_maximo: null };

    const { error: eventoError } = await this.supabase
      .from('eventos')
      .update(rango)
      .eq('id', eventoId);

    if (eventoError) throw eventoError;
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
      
      return (response.data as TipoBoleta[]) || [];
    } catch (error) {
      console.error('Error en getAllTiposBoleta:', error);
      throw error;
    }
  }

  /**
   * Suma unidades al inventario sin modificar cantidad_vendidas.
   */
  async agregarInventarioTipoBoleta(id: number, cantidadAgregar: number): Promise<TipoBoleta> {
    if (!Number.isFinite(cantidadAgregar) || cantidadAgregar <= 0) {
      throw new Error('La cantidad a agregar debe ser mayor a 0');
    }
    const tipo = await this.getTipoBoletaById(id);
    const vendidas = Number(tipo.cantidad_vendidas ?? 0);
    const nuevoTotal = Number(tipo.cantidad_total) + cantidadAgregar;
    if (nuevoTotal < vendidas) {
      throw new Error('El inventario total no puede quedar por debajo de las unidades vendidas');
    }
    return this.updateTipoBoleta(id, {
      cantidad_total: nuevoTotal,
      cantidad_disponibles: nuevoTotal - vendidas
    });
  }

  /**
   * Unidades de inventario consumidas (palcos/entradas con consume_inventario).
   */
  async getCantidadBoletasVendidas(tipoBoletaId: number): Promise<number> {
    try {
      const { count, error } = await this.supabase
        .from('boletas_compradas')
        .select('*, compras!inner(estado_pago)', { count: 'exact', head: true })
        .eq('tipo_boleta_id', tipoBoletaId)
        .eq('compras.estado_pago', 'completado')
        .eq('consume_inventario', true);
      
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
      const validadorId = this.authService.getUsuarioId();
      const update: Record<string, unknown> = {
        estado: 'usada',
        fecha_uso: this.timezoneService.getCurrentDateISO(),
      };
      if (validadorId != null) {
        update['validado_por_usuario_id'] = validadorId;
      }

      const response = await this.supabase
        .from('boletas_compradas')
        .update(update)
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
        .select(this.selectBoletaConRelaciones)
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
    return this.buscarBoletasPorDocumentoInterno(documento, false);
  }

  /** Solo boletas pendientes (sin usar), como en la app móvil. */
  async buscarBoletasPendientesPorDocumento(documento: string): Promise<BoletaComprada[]> {
    return this.buscarBoletasPorDocumentoInterno(documento, true);
  }

  private async resolverUsuarioIdsPorDocumento(documento: string): Promise<number[]> {
    const doc = normalizarDocumentoIdentidad(documento);
    if (!doc) {
      return [];
    }

    const { data, error } = await this.supabase
      .from('usuarios')
      .select('id')
      .eq('documento_identidad', doc);

    if (error) {
      throw error;
    }

    return [
      ...new Set(
        (data || [])
          .map((u) => Number(u.id))
          .filter((id) => Number.isFinite(id) && id > 0)
      ),
    ];
  }

  private boletaCompraPagada(boleta: BoletaComprada): boolean {
    const pago = (boleta.estado_pago || boleta.compra?.estado_pago || '').toLowerCase();
    return pago === 'completado';
  }

  private async buscarBoletasPorDocumentoInterno(
    documento: string,
    soloPendientes: boolean
  ): Promise<BoletaComprada[]> {
    try {
      const usuarioIds = await this.resolverUsuarioIdsPorDocumento(documento);
      if (usuarioIds.length === 0) {
        return [];
      }

      let query = this.supabase
        .from('boletas_compradas')
        .select(this.selectBoletaConRelaciones)
        .in('asistente_usuario_id', usuarioIds);
      if (soloPendientes) {
        query = query.eq('estado', 'pendiente');
      }
      const response = await query.order('fecha_creacion', { ascending: false });

      if (response.error) {
        throw response.error;
      }

      let boletas = ((response.data as any[]) || []).map((boleta) =>
        this.normalizarBoletaConCompra(boleta)
      );

      if (soloPendientes) {
        boletas = boletas.filter((boleta) => this.boletaCompraPagada(boleta));
      }

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
        cliente_id: compra.cliente_id,
        numero_transaccion: compra.numero_transaccion,
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
        cliente_id: compra.cliente_id,
        numero_transaccion: compra.numero_transaccion,
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

    if (boleta.tipos_boleta) {
      const tb = Array.isArray(boleta.tipos_boleta) ? boleta.tipos_boleta[0] : boleta.tipos_boleta;
      if (tb) {
        boletaNormalizada.tipo_boleta_meta = {
          nombre: tb.nombre,
          personas_por_unidad: tb.personas_por_unidad,
          es_palco: tb.es_palco
        };
      }
    }
    
    if (boleta.palcos) {
      const pRow = Array.isArray(boleta.palcos) ? boleta.palcos[0] : boleta.palcos;
      if (pRow && typeof pRow.numero === 'number') {
        boletaNormalizada.numero_palco = pRow.numero;
      }
    }

    if (boleta.validado_por != null) {
      const vp = Array.isArray(boleta.validado_por) ? boleta.validado_por[0] : boleta.validado_por;
      boletaNormalizada.validado_por = vp ?? null;
    }

    if (boleta.asistente_usuario != null) {
      const au = Array.isArray(boleta.asistente_usuario)
        ? boleta.asistente_usuario[0]
        : boleta.asistente_usuario;
      boletaNormalizada.asistente_usuario = au ?? null;
    }
    
    // Limpiar los objetos del join (ya los tenemos normalizados)
    delete (boletaNormalizada as any).compras;
    delete (boletaNormalizada as any).tipos_boleta;
    delete (boletaNormalizada as any).palcos;
    
    return boletaNormalizada;
  }
}
