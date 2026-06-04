import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { TimezoneService } from './timezone.service';
import { AuthService } from './auth.service';
import { supabaseConfig } from '../config/supabase.config';
import {
  CompraProducto,
  CompraProductoFilters,
  CompraProductoItem,
  PaginatedResponse,
  TipoEstadoCompra,
  TipoEstadoItemProducto,
  TipoEstadoPago,
  TipoEstadoTransaccionProducto,
  TransaccionProducto
} from '../types';

export interface ItemCompraProducto {
  producto_id: number;
  cantidad: number;
  precio_unitario: number;
}

export interface DatosCompraProducto {
  evento_id: number;
  cliente_id: number;
  items: ItemCompraProducto[];
  subtotal?: number;
  porcentaje_servicio?: number;
  valor_servicio?: number;
  descuento_total?: number;
  total?: number;
  terminos_licor_aceptados?: boolean;
  datos_facturacion?: Record<string, unknown>;
}

/** Payload enviado a Wompi antes del pago; la compra se crea solo si el cobro es exitoso. */
export interface PedidoProductosPendiente {
  evento_id: number;
  cliente_id: number;
  items: ItemCompraProducto[];
  subtotal: number;
  porcentaje_servicio: number;
  valor_servicio: number;
  total: number;
  terminos_licor_aceptados: boolean;
}

export interface ItemProductoEscaneo {
  id: number;
  codigo_qr: string;
  estado: string;
  cantidad: number;
  scope?: 'item' | 'compra';
  precio_unitario: number;
  fecha_redencion?: string;
  validado_por_usuario_id?: number;
  compra: {
    id: number;
    evento_id: number;
    estado_pago: string;
    numero_pedido: string;
    evento_titulo?: string;
    documento_cliente?: string;
  } | null;
  producto: {
    id: number;
    nombre: string;
  } | null;
  productos_resumen?: string[];
}

export interface IniciarCheckoutParams {
  tipo?: 'boletas' | 'productos' | 'mixto';
  amount_in_cents?: number;
  customer_email?: string;
  redirect_url?: string;
  pedido_boletas?: Record<string, unknown>;
  pedido_productos?: Record<string, unknown>;
}

export interface IniciarCheckoutResult {
  success: boolean;
  error?: string;
  checkout_url?: string;
  transaccion_checkout_id?: number | null;
  transaccion_producto_id?: number | null;
  compra_id?: number | null;
  compra_producto_id?: number | null;
}

@Injectable({
  providedIn: 'root'
})
export class ComprasProductoService {
  private transaccionesProductoDisponible: boolean | null = null;

  constructor(
    private supabase: SupabaseService,
    private timezoneService: TimezoneService,
    private authService: AuthService
  ) {}

  private esErrorTablaNoExiste(error: unknown): boolean {
    const e = error as { code?: string; message?: string } | null;
    const message = String(e?.message || '').toLowerCase();
    return (
      e?.code === 'PGRST205' ||
      e?.code === '42P01' ||
      (message.includes('could not find the table') && message.includes('transacciones_producto'))
    );
  }

  private generarNumeroPedido(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return `PROD-${timestamp}-${random}`;
  }

  private generarNumeroTransaccion(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return `WPROD-${timestamp}-${random}`;
  }

  /**
   * Inicia el checkout unificado (boletas/productos/mixto) vía Edge Function.
   * Se mantiene para compatibilidad con flujos legacy como ventas-manual.
   */
  async iniciarCheckout(params: IniciarCheckoutParams): Promise<IniciarCheckoutResult> {
    try {
      const {
        data: { session }
      } = await this.supabase.getClient().auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        return { success: false, error: 'No se pudo obtener token de autenticación' };
      }

      const response = await fetch(`${supabaseConfig.url}/functions/v1/wompi-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          apikey: supabaseConfig.anonKey
        },
        body: JSON.stringify(params)
      });

      const payload = (await response.json()) as Record<string, unknown>;
      const success = response.ok && payload?.['success'] === true;
      if (!success) {
        return {
          success: false,
          error: String(payload?.['error'] || 'No se pudo iniciar el checkout')
        };
      }

      const transaccionCheckoutId = payload?.['transaccion_checkout_id']
        ? Number(payload['transaccion_checkout_id'])
        : null;
      const transaccionProductoId = payload?.['transaccion_producto_id']
        ? Number(payload['transaccion_producto_id'])
        : null;

      let compraId: number | null = null;
      let compraProductoId: number | null = null;

      if (transaccionCheckoutId) {
        const resolved = await this.resolverPorCheckoutId(transaccionCheckoutId);
        compraId = resolved.compraId;
        compraProductoId = resolved.compraProductoId;
      }

      return {
        success: true,
        checkout_url: String(payload?.['checkout_url'] || ''),
        transaccion_checkout_id: transaccionCheckoutId,
        transaccion_producto_id: transaccionProductoId,
        compra_id: compraId,
        compra_producto_id: compraProductoId
      };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || 'Error iniciando checkout'
      };
    }
  }

  async validarDisponibilidad(items: ItemCompraProducto[]): Promise<{ valido: boolean; errores: string[] }> {
    const errores: string[] = [];

    for (const item of items) {
      const { data: producto, error } = await this.supabase
        .from('productos')
        .select('nombre, cantidad_total, cantidad_vendidas, cantidad_disponibles, activo, limite_por_persona, fecha_venta_inicio, fecha_venta_fin')
        .eq('id', item.producto_id)
        .single();

      if (error || !producto) {
        errores.push(`Producto ${item.producto_id} no encontrado`);
        continue;
      }

      if (!producto.activo) {
        errores.push(`"${producto.nombre}" no está disponible`);
        continue;
      }

      const disponibles = producto.cantidad_disponibles ?? Math.max(0, producto.cantidad_total - (producto.cantidad_vendidas ?? 0));
      if (item.cantidad > disponibles) {
        errores.push(`"${producto.nombre}": solo hay ${disponibles} unidad(es) disponible(s)`);
      }

      if (producto.limite_por_persona && item.cantidad > producto.limite_por_persona) {
        errores.push(`"${producto.nombre}": máximo ${producto.limite_por_persona} por persona`);
      }

      const ahora = new Date();
      if (producto.fecha_venta_inicio && new Date(producto.fecha_venta_inicio) > ahora) {
        errores.push(`"${producto.nombre}" aún no está en venta`);
      }
      if (producto.fecha_venta_fin && new Date(producto.fecha_venta_fin) < ahora) {
        errores.push(`"${producto.nombre}" ya no está en venta`);
      }
    }

    return { valido: errores.length === 0, errores };
  }

  async procesarCompra(datos: DatosCompraProducto): Promise<{ compra: CompraProducto; items: CompraProductoItem[] }> {
    const subtotal = datos.items.reduce((sum, i) => sum + i.precio_unitario * i.cantidad, 0);
    const descuentoTotal = Math.max(0, Number(datos.descuento_total ?? 0));
    const baseNeta = Math.max(0, subtotal - descuentoTotal);
    const porcentajeServicio = datos.porcentaje_servicio ?? await this.obtenerPorcentajeServicioEvento(datos.evento_id);
    const valorServicio = datos.valor_servicio ?? (baseNeta * porcentajeServicio) / 100;
    const total = datos.total ?? baseNeta + valorServicio;

    const compraData = {
      cliente_id: datos.cliente_id,
      evento_id: datos.evento_id,
      numero_pedido: this.generarNumeroPedido(),
      subtotal,
      descuento_total: descuentoTotal,
      porcentaje_servicio: porcentajeServicio,
      valor_servicio: valorServicio,
      total,
      estado_pago: TipoEstadoPago.PENDIENTE,
      estado_compra: TipoEstadoCompra.PENDIENTE,
      terminos_licor_aceptados: !!datos.terminos_licor_aceptados,
      terminos_licor_aceptados_at: datos.terminos_licor_aceptados ? this.timezoneService.getCurrentDateISO() : null,
      datos_facturacion: datos.datos_facturacion,
      fecha_compra: this.timezoneService.getCurrentDateISO()
    };

    const { data: compra, error: compraError } = await this.supabase
      .from('compras_productos')
      .insert(compraData)
      .select()
      .single();

    if (compraError || !compra) {
      throw compraError || new Error('Error al crear la compra de productos');
    }

    const compraId = compra.id;

    try {
      const rows = datos.items.map((item) => ({
        compra_producto_id: compraId,
        producto_id: item.producto_id,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        estado: TipoEstadoItemProducto.PENDIENTE
      }));

      const { data: items, error: itemsError } = await this.supabase
        .from('compras_productos_items')
        .insert(rows)
        .select();

      if (itemsError) {
        throw itemsError;
      }

      return { compra: compra as CompraProducto, items: (items as CompraProductoItem[]) || [] };
    } catch (innerErr) {
      await this.supabase.from('compras_productos').delete().eq('id', compraId);
      throw innerErr;
    }
  }

  async crearTransaccionPendiente(compraProductoId: number, monto: number): Promise<TransaccionProducto> {
    const montoCentavos = Math.round(monto * 100);
    const payload = {
      compra_producto_id: compraProductoId,
      numero_transaccion: this.generarNumeroTransaccion(),
      monto,
      monto_centavos: montoCentavos,
      moneda: 'COP',
      estado: TipoEstadoTransaccionProducto.PENDIENTE,
      es_activa: true,
      fecha_creacion: this.timezoneService.getCurrentDateISO()
    };

    const { data, error } = await this.supabase
      .from('transacciones_producto')
      .insert(payload)
      .select()
      .single();

    if (error) {
      throw error;
    }
    return data as TransaccionProducto;
  }

  async actualizarTransaccionWompi(
    transaccionId: number,
    datos: Partial<TransaccionProducto>
  ): Promise<TransaccionProducto> {
    const { data, error } = await this.supabase
      .from('transacciones_producto')
      .update({
        ...datos,
        fecha_actualizacion: this.timezoneService.getCurrentDateISO()
      })
      .eq('id', transaccionId)
      .select()
      .single();

    if (error) {
      throw error;
    }
    return data as TransaccionProducto;
  }

  async getComprasByCliente(clienteId: number): Promise<CompraProducto[]> {
    const { data, error } = await this.supabase
      .from('compras_productos')
      .select(`
        *,
        eventos(id, titulo, imagen_principal, fecha_inicio, fecha_fin, lugar:lugares(id, nombre)),
        compras_productos_items(
          *,
          productos(id, nombre, imagen_url, es_licor, precio, precio_evento)
        )
      `)
      .eq('cliente_id', clienteId)
      .eq('estado_pago', TipoEstadoPago.COMPLETADO)
      .neq('estado_compra', TipoEstadoCompra.CANCELADA)
      .order('fecha_compra', { ascending: false });

    if (error) {
      throw error;
    }
    return (data as CompraProducto[]) ?? [];
  }

  async getComprasAdmin(filters?: CompraProductoFilters): Promise<PaginatedResponse<CompraProducto>> {
    let query = this.supabase
      .from('compras_productos')
      .select(
        `
        *,
        cliente:usuarios(id, nombre, apellido, email, telefono, documento_identidad),
        eventos(id, titulo, fecha_inicio),
        compras_productos_items(
          id,
          compra_producto_id,
          producto_id,
          cantidad,
          precio_unitario,
          estado,
          productos(id, nombre)
        )
      `,
        { count: 'exact' }
      );

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
    if (filters?.search?.trim()) {
      query = query.ilike('numero_pedido', `%${filters.search.trim()}%`);
    }

    const sortBy = filters?.sortBy || 'fecha_compra';
    const sortOrder = filters?.sortOrder || 'desc';
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const fromIndex = (page - 1) * limit;
    const toIndex = fromIndex + limit - 1;
    query = query.range(fromIndex, toIndex);

    const { data, error, count } = await query;
    if (error) {
      throw error;
    }

    const total = count || 0;
    return {
      data: (data as CompraProducto[]) || [],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getCompraById(id: number): Promise<CompraProducto> {
    const { data, error } = await this.supabase
      .from('compras_productos')
      .select(`
        *,
        eventos(id, titulo, imagen_principal),
        compras_productos_items(
          *,
          productos(id, nombre, imagen_url, es_licor, precio, precio_evento)
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      throw error;
    }
    return data as CompraProducto;
  }

  async updateCompraAdmin(id: number, compra: Partial<CompraProducto>): Promise<CompraProducto> {
    const { data: existingData, error: checkError } = await this.supabase
      .from('compras_productos')
      .select('id')
      .eq('id', id)
      .single();

    if (checkError || !existingData) {
      throw new Error(`No se encontró la compra de productos con ID ${id}`);
    }

    const { data, error } = await this.supabase
      .from('compras_productos')
      .update(compra)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        const { data: retryData, error: retryError } = await this.supabase
          .from('compras_productos')
          .select('*')
          .eq('id', id)
          .single();

        if (retryError) {
          throw retryError;
        }
        return retryData as CompraProducto;
      }
      throw error;
    }

    return data as CompraProducto;
  }

  async buscarItemPorCodigoQR(codigoQR: string): Promise<ItemProductoEscaneo | null> {
    const { data, error } = await this.supabase
      .from('compras_productos_items')
      .select(`
        id,
        codigo_qr,
        estado,
        cantidad,
        precio_unitario,
        fecha_redencion,
        validado_por_usuario_id,
        compra:compras_productos(
          id,
          evento_id,
          estado_pago,
          numero_pedido,
          eventos(titulo),
          cliente:usuarios(documento_identidad)
        ),
        producto:productos(id, nombre)
      `)
      .eq('codigo_qr', codigoQR)
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) return null;

    const compraRaw = Array.isArray(data.compra) ? data.compra[0] : data.compra;
    const eventoRel = Array.isArray(compraRaw?.eventos) ? compraRaw?.eventos[0] : compraRaw?.eventos;
    const clienteRel = Array.isArray(compraRaw?.cliente) ? compraRaw?.cliente[0] : compraRaw?.cliente;

    return {
      id: data.id,
      codigo_qr: data.codigo_qr,
      estado: data.estado || TipoEstadoItemProducto.PENDIENTE,
      scope: 'item',
      cantidad: data.cantidad || 0,
      precio_unitario: Number(data.precio_unitario || 0),
      fecha_redencion: data.fecha_redencion || undefined,
      validado_por_usuario_id: data.validado_por_usuario_id || undefined,
      compra: compraRaw ? {
        id: Number(compraRaw.id),
        evento_id: Number(compraRaw.evento_id),
        estado_pago: String(compraRaw.estado_pago || ''),
        numero_pedido: String(compraRaw.numero_pedido || ''),
        evento_titulo: String(eventoRel?.titulo || ''),
        documento_cliente: String(clienteRel?.documento_identidad || ''),
      } : null,
      producto: Array.isArray(data.producto) ? (data.producto[0] as ItemProductoEscaneo['producto']) : (data.producto as ItemProductoEscaneo['producto']),
    };
  }

  private extraerNumeroPedidoDesdeCodigoQR(codigoQR: string): string | null {
    const value = String(codigoQR || '').trim();
    if (!value) return null;
    const prefix = 'PROD-ORD-';
    if (!value.startsWith(prefix)) return null;
    const numeroPedido = value.slice(prefix.length).trim();
    return numeroPedido || null;
  }

  async buscarCompraPorCodigoQR(codigoQR: string): Promise<ItemProductoEscaneo | null> {
    const numeroPedido = this.extraerNumeroPedidoDesdeCodigoQR(codigoQR);
    if (!numeroPedido) return null;

    const { data, error } = await this.supabase
      .from('compras_productos')
      .select(`
        id,
        evento_id,
        estado_pago,
        numero_pedido,
        eventos(titulo),
        cliente:usuarios(documento_identidad),
        compras_productos_items(
          id,
          estado,
          cantidad,
          precio_unitario,
          fecha_redencion,
          validado_por_usuario_id,
          producto:productos(id, nombre)
        )
      `)
      .eq('numero_pedido', numeroPedido)
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) return null;

    const items = ((data.compras_productos_items || []) as Array<{
      id: number;
      estado?: string;
      cantidad?: number;
      precio_unitario?: number;
      fecha_redencion?: string;
      validado_por_usuario_id?: number;
      producto?: { id?: number; nombre?: string } | Array<{ id?: number; nombre?: string }> | null;
    }>).filter(Boolean);

    if (items.length === 0) {
      return null;
    }

    const totalCantidad = items.reduce((acc, item) => acc + Number(item.cantidad || 0), 0);
    const totalValor = items.reduce(
      (acc, item) => acc + Number(item.precio_unitario || 0) * Number(item.cantidad || 0),
      0
    );
    const todosEntregados = items.every(
      (item) => String(item.estado || '').toLowerCase() === TipoEstadoItemProducto.ENTREGADO
    );
    const resumenPorProducto = new Map<string, { nombre: string; cantidad: number }>();
    for (const item of items) {
      const productoObj = Array.isArray(item.producto) ? item.producto[0] : item.producto;
      const nombre = String(productoObj?.nombre || 'Producto').trim();
      const key = String(productoObj?.id ?? nombre);
      const actual = resumenPorProducto.get(key);
      if (actual) {
        actual.cantidad += Number(item.cantidad || 0);
      } else {
        resumenPorProducto.set(key, {
          nombre,
          cantidad: Number(item.cantidad || 0),
        });
      }
    }
    const resumenEntrega = Array.from(resumenPorProducto.values()).map(
      (r) => `${r.nombre} x${r.cantidad}`
    );

    const primerItem = items[0];

    return {
      id: Number(data.id),
      codigo_qr: codigoQR,
      estado: todosEntregados ? TipoEstadoItemProducto.ENTREGADO : TipoEstadoItemProducto.CONFIRMADO,
      scope: 'compra',
      cantidad: totalCantidad,
      precio_unitario: totalCantidad > 0 ? totalValor / totalCantidad : 0,
      fecha_redencion: primerItem?.fecha_redencion || undefined,
      validado_por_usuario_id: primerItem?.validado_por_usuario_id || undefined,
      compra: {
        id: Number(data.id),
        evento_id: Number(data.evento_id),
        estado_pago: String(data.estado_pago || ''),
        numero_pedido: String(data.numero_pedido || numeroPedido),
        evento_titulo: String((Array.isArray((data as any).eventos) ? (data as any).eventos[0]?.titulo : (data as any).eventos?.titulo) || ''),
        documento_cliente: String((Array.isArray((data as any).cliente) ? (data as any).cliente[0]?.documento_identidad : (data as any).cliente?.documento_identidad) || ''),
      },
      producto: {
        id: 0,
        nombre: 'Pedido de productos',
      },
      productos_resumen: resumenEntrega,
    };
  }

  async validarItemProducto(itemId: number): Promise<void> {
    const validadorId = this.authService.getUsuarioId();
    const payload: Record<string, unknown> = {
      estado: TipoEstadoItemProducto.ENTREGADO,
      fecha_redencion: this.timezoneService.getCurrentDateISO(),
    };
    if (validadorId != null) {
      payload['validado_por_usuario_id'] = validadorId;
    }

    const { error } = await this.supabase
      .from('compras_productos_items')
      .update(payload)
      .eq('id', itemId);

    if (error) {
      throw error;
    }
  }

  async validarCompraProductos(compraId: number): Promise<void> {
    const validadorId = this.authService.getUsuarioId();
    const payload: Record<string, unknown> = {
      estado: TipoEstadoItemProducto.ENTREGADO,
      fecha_redencion: this.timezoneService.getCurrentDateISO(),
    };
    if (validadorId != null) {
      payload['validado_por_usuario_id'] = validadorId;
    }

    const { error } = await this.supabase
      .from('compras_productos_items')
      .update(payload)
      .eq('compra_producto_id', compraId)
      .neq('estado', TipoEstadoItemProducto.ENTREGADO);

    if (error) {
      throw error;
    }
  }

  async getTransaccionById(id: number): Promise<TransaccionProducto> {
    const { data, error } = await this.supabase
      .from('transacciones_producto')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw error;
    }
    return data as TransaccionProducto;
  }

  /**
   * Resuelve ids legacy desde la capa unificada de checkout.
   * Si la tabla/campos aun no existen en el ambiente, retorna vacio para mantener compatibilidad.
   */
  async resolverPorCheckoutId(transaccionCheckoutId: number): Promise<{
    compraId: number | null;
    compraProductoId: number | null;
    transaccionProductoId: number | null;
  }> {
    if (!Number.isFinite(transaccionCheckoutId) || transaccionCheckoutId <= 0) {
      return { compraId: null, compraProductoId: null, transaccionProductoId: null };
    }

    try {
      const { data } = await this.supabase
        .from('transacciones_checkout')
        .select('id, compra_id, compra_producto_id, metadata, request_payload')
        .eq('id', transaccionCheckoutId)
        .maybeSingle();

      if (!data) {
        return { compraId: null, compraProductoId: null, transaccionProductoId: null };
      }

      const metadata = (data.metadata ?? {}) as Record<string, unknown>;
      const requestPayload = (data.request_payload ?? {}) as Record<string, unknown>;
      const transaccionProductoId =
        Number(metadata['transaccion_producto_id'] ?? requestPayload['transaccion_producto_id'] ?? 0) || null;

      return {
        compraId: data.compra_id ? Number(data.compra_id) : null,
        compraProductoId: data.compra_producto_id ? Number(data.compra_producto_id) : null,
        transaccionProductoId
      };
    } catch {
      return { compraId: null, compraProductoId: null, transaccionProductoId: null };
    }
  }

  async getTransaccionCheckoutById(id: number): Promise<{
    id: number;
    estado: string;
    wompi_status: string | null;
    total: number;
    numero_intento: string | null;
    wompi_reference: string | null;
    compra_id: number | null;
    compra_producto_id: number | null;
    fecha_creacion: string | null;
    fecha_confirmacion: string | null;
    fecha_cancelacion: string | null;
    expires_at: string | null;
  } | null> {
    if (!Number.isFinite(id) || id <= 0) {
      return null;
    }

    const { data, error } = await this.supabase
      .from('transacciones_checkout')
      .select(
        'id, estado, wompi_status, total, numero_intento, wompi_reference, compra_id, compra_producto_id, fecha_creacion, fecha_confirmacion, fecha_cancelacion, expires_at'
      )
      .eq('id', id)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return {
      id: Number(data.id),
      estado: String(data.estado ?? 'pendiente'),
      wompi_status: data.wompi_status ? String(data.wompi_status) : null,
      total: Number(data.total ?? 0),
      numero_intento: data.numero_intento ? String(data.numero_intento) : null,
      wompi_reference: data.wompi_reference ? String(data.wompi_reference) : null,
      compra_id: data.compra_id ? Number(data.compra_id) : null,
      compra_producto_id: data.compra_producto_id ? Number(data.compra_producto_id) : null,
      fecha_creacion: data.fecha_creacion ? String(data.fecha_creacion) : null,
      fecha_confirmacion: data.fecha_confirmacion ? String(data.fecha_confirmacion) : null,
      fecha_cancelacion: data.fecha_cancelacion ? String(data.fecha_cancelacion) : null,
      expires_at: data.expires_at ? String(data.expires_at) : null,
    };
  }

  /** Resuelve compra/transacción cuando Wompi redirige solo con ?id=...&env=... */
  async resolverPorWompiRedirect(wompiTxnId: string): Promise<{
    compraId: number | null;
    compraProductoId: number | null;
    transaccionProductoId: number | null;
  }> {
    const id = wompiTxnId.trim();
    if (!id) {
      return { compraId: null, compraProductoId: null, transaccionProductoId: null };
    }

    const vacio = { compraId: null, compraProductoId: null, transaccionProductoId: null };

    if (this.transaccionesProductoDisponible !== false) {
      const { data: txnDirecta, error: txnDirectaError } = await this.supabase
        .from('transacciones_producto')
        .select('id, compra_producto_id')
        .eq('es_activa', true)
        .or(
          [
            `wompi_transaction_id.eq.${id}`,
            `response_payload->>id.eq.${id}`,
            `webhook_payload->data->transaction->>id.eq.${id}`,
          ].join(',')
        )
        .order('fecha_creacion', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (txnDirectaError && this.esErrorTablaNoExiste(txnDirectaError)) {
        this.transaccionesProductoDisponible = false;
      } else if (!txnDirectaError) {
        this.transaccionesProductoDisponible = true;
      }

      if (txnDirecta) {
        return {
          compraId: null,
          compraProductoId: txnDirecta.compra_producto_id ?? null,
          transaccionProductoId: txnDirecta.id,
        };
      }
    }

    const { data: compraDirecta } = await this.supabase
      .from('compras')
      .select('id')
      .or(
        [
          `wompi_transaction_id.eq.${id}`,
          `wompi_response->>id.eq.${id}`,
          `wompi_webhook_data->data->transaction->>id.eq.${id}`,
        ].join(',')
      )
      .order('fecha_compra', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (compraDirecta) {
      return { compraId: compraDirecta.id, compraProductoId: null, transaccionProductoId: null };
    }

    if (this.transaccionesProductoDisponible !== false) {
      const { data: txnsRecientes, error: txnsRecientesError } = await this.supabase
        .from('transacciones_producto')
        .select('id, compra_producto_id, wompi_transaction_id, response_payload, webhook_payload')
        .eq('es_activa', true)
        .order('fecha_creacion', { ascending: false })
        .limit(40);

      if (txnsRecientesError && this.esErrorTablaNoExiste(txnsRecientesError)) {
        this.transaccionesProductoDisponible = false;
      } else if (!txnsRecientesError) {
        this.transaccionesProductoDisponible = true;
      }

      const txnPorPayload = (txnsRecientes ?? []).find((row) =>
        this.payloadContieneWompiId(row.response_payload, id) ||
        this.payloadContieneWompiId(row.webhook_payload, id) ||
        row.wompi_transaction_id === id
      );

      if (txnPorPayload) {
        return {
          compraId: null,
          compraProductoId: txnPorPayload.compra_producto_id ?? null,
          transaccionProductoId: txnPorPayload.id,
        };
      }
    }

    const { data: checkoutDirecto } = await this.supabase
      .from('transacciones_checkout')
      .select('id, compra_id, compra_producto_id, wompi_transaction_id, response_payload, webhook_payload')
      .or(
        [
          `wompi_transaction_id.eq.${id}`,
          `response_payload->>id.eq.${id}`,
          `webhook_payload->data->transaction->>id.eq.${id}`,
        ].join(',')
      )
      .order('fecha_creacion', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (checkoutDirecto) {
      return {
        compraId: checkoutDirecto.compra_id ? Number(checkoutDirecto.compra_id) : null,
        compraProductoId: checkoutDirecto.compra_producto_id ? Number(checkoutDirecto.compra_producto_id) : null,
        transaccionProductoId: null,
      };
    }

    const { data: comprasRecientes } = await this.supabase
      .from('compras')
      .select('id, wompi_transaction_id, wompi_response, wompi_webhook_data')
      .order('fecha_compra', { ascending: false })
      .limit(40);

    const compraPorPayload = (comprasRecientes ?? []).find(
      (row) =>
        row.wompi_transaction_id === id ||
        this.payloadContieneWompiId(row.wompi_response, id) ||
        this.payloadContieneWompiId(row.wompi_webhook_data, id)
    );

    if (compraPorPayload) {
      return {
        compraId: compraPorPayload.id,
        compraProductoId: null,
        transaccionProductoId: null,
      };
    }

    return vacio;
  }

  private payloadContieneWompiId(payload: unknown, wompiId: string): boolean {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    const visitados = new Set<unknown>();
    const cola: unknown[] = [payload];

    while (cola.length > 0) {
      const actual = cola.pop();
      if (!actual || typeof actual !== 'object' || visitados.has(actual)) {
        continue;
      }
      visitados.add(actual);

      const obj = actual as Record<string, unknown>;
      if (obj['id'] === wompiId) {
        return true;
      }

      for (const valor of Object.values(obj)) {
        if (valor && typeof valor === 'object') {
          cola.push(valor);
        }
      }
    }

    return false;
  }

  /** Consulta Wompi y reprocesa el pago cuando el webhook no llegó a tiempo. */
  async sincronizarEstadoWompi(params: {
    wompi_transaction_id?: string;
    transaccion_checkout_id?: number;
    transaccion_producto_id?: number;
    force_cancel?: boolean;
  }): Promise<{ success: boolean; wompi_status?: string }> {
    const wompiTransactionId = params.wompi_transaction_id?.trim();
    const transaccionCheckoutId = params.transaccion_checkout_id
      ? Number(params.transaccion_checkout_id)
      : null;
    if (!wompiTransactionId && !transaccionCheckoutId) {
      return { success: false };
    }

    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      return { success: false };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${supabaseConfig.url}/functions/v1/wompi-sync-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          apikey: supabaseConfig.anonKey,
        },
        body: JSON.stringify({
          wompi_transaction_id: wompiTransactionId,
          transaccion_checkout_id: transaccionCheckoutId ?? undefined,
          transaccion_producto_id: params.transaccion_producto_id,
          force_cancel: !!params.force_cancel,
        }),
        signal: controller.signal,
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        return { success: false, wompi_status: data.wompi_status };
      }

      return { success: true, wompi_status: data.wompi_status };
    } catch {
      return { success: false };
    } finally {
      clearTimeout(timeout);
    }
  }

  async cancelarCheckoutPendiente(transaccionCheckoutId: number): Promise<boolean> {
    if (!Number.isFinite(transaccionCheckoutId) || transaccionCheckoutId <= 0) {
      return false;
    }
    const result = await this.sincronizarEstadoWompi({
      transaccion_checkout_id: transaccionCheckoutId,
      force_cancel: true,
    });
    return !!result.success;
  }

  async confirmarPago(compraProductoId: number): Promise<CompraProducto> {
    const { error: rpcError } = await this.supabase.getClient().rpc('confirmar_compra_producto', {
      p_compra_producto_id: compraProductoId
    });

    if (rpcError) {
      const { data, error } = await this.supabase
        .from('compras_productos')
        .update({
          estado_pago: TipoEstadoPago.COMPLETADO,
          estado_compra: TipoEstadoCompra.CONFIRMADA,
          fecha_confirmacion: this.timezoneService.getCurrentDateISO()
        })
        .eq('id', compraProductoId)
        .select()
        .single();

      if (error) {
        throw error;
      }
      return data as CompraProducto;
    }

    return this.getCompraById(compraProductoId);
  }

  private async obtenerPorcentajeServicioEvento(eventoId: number): Promise<number> {
    const { data, error } = await this.supabase
      .from('eventos')
      .select('porcentaje_servicio')
      .eq('id', eventoId)
      .single();

    if (error) {
      throw error;
    }
    const raw = Number((data as { porcentaje_servicio?: number } | null)?.porcentaje_servicio ?? 0);
    if (!Number.isFinite(raw)) return 0;
    return Math.min(100, Math.max(0, raw));
  }
}
