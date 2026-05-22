import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { TimezoneService } from './timezone.service';
import {
  CompraProducto,
  CompraProductoItem,
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

@Injectable({
  providedIn: 'root'
})
export class ComprasProductoService {
  constructor(
    private supabase: SupabaseService,
    private timezoneService: TimezoneService
  ) {}

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

  async getCompraById(id: number): Promise<CompraProducto> {
    const { data, error } = await this.supabase
      .from('compras_productos')
      .select(`
        *,
        eventos(id, titulo, imagen_principal),
        compras_productos_items(
          *,
          productos(id, nombre, imagen_url, es_licor)
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      throw error;
    }
    return data as CompraProducto;
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
