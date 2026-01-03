/* ============================================
   COMPRAS CLIENTE SERVICE
   Servicio para manejar el proceso de compra de boletas
   ============================================ */

import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { TimezoneService } from './timezone.service';
import { EventosService } from './eventos.service';
import { AuthService } from './auth.service';
import { Compra, BoletaComprada, TipoBoleta, MetodoPago, TipoEstadoPago, TipoEstadoCompra, TipoEstadoBoleta, TipoEstadoEvento } from '../types';

export interface ItemCompra {
  tipo_boleta_id: number;
  cantidad: number;
  precio_unitario: number;
  nombre_asistente?: string;
  documento_asistente?: string;
  email_asistente?: string;
  telefono_asistente?: string;
}

export interface DatosCompra {
  evento_id: number;
  cliente_id: number;
  items: ItemCompra[];
  metodo_pago?: MetodoPago; // Opcional, Wompi lo determinará
  datos_facturacion?: Record<string, any>;
}

@Injectable({
  providedIn: 'root'
})
export class ComprasClienteService {
  constructor(
    private supabase: SupabaseService,
    private timezoneService: TimezoneService,
    private eventosService: EventosService,
    private authService: AuthService
  ) {}

  /**
   * Genera un número de transacción único
   */
  private generarNumeroTransaccion(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return `TXN-${timestamp}-${random}`;
  }

  /**
   * Genera un código QR único para una boleta
   */
  private generarCodigoQR(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `QR-${timestamp}-${random}`.toUpperCase();
  }

  /**
   * Valida que haya disponibilidad de boletas
   */
  async validarDisponibilidad(items: ItemCompra[]): Promise<{ valido: boolean; errores: string[] }> {
    try {
      const errores: string[] = [];
      const eventosVerificados = new Set<number>();
      
      for (const item of items) {
        const { data: tipoBoleta, error } = await this.supabase
          .from('tipos_boleta')
          .select('cantidad_total, cantidad_vendidas, cantidad_disponibles, activo, nombre, evento_id')
          .eq('id', item.tipo_boleta_id)
          .single();

        if (error || !tipoBoleta) {
          errores.push(`Tipo de boleta ${item.tipo_boleta_id} no encontrado`);
          continue;
        }

        // Verificar fecha de finalización del evento (solo una vez por evento)
        if (tipoBoleta.evento_id && !eventosVerificados.has(tipoBoleta.evento_id)) {
          eventosVerificados.add(tipoBoleta.evento_id);
          
          try {
            const evento = await this.eventosService.getEventoById(tipoBoleta.evento_id);
            const ahora = new Date();
            const fechaFin = new Date(evento.fecha_fin);
            
            if (fechaFin < ahora) {
              // El evento ya finalizó, actualizar estado solo si es cliente (versión pública)
              const esCliente = this.authService.isCliente();
              
              if (esCliente) {
                try {
                  await this.eventosService.updateEvento(evento.id, {
                    estado: TipoEstadoEvento.FINALIZADO,
                    activo: false
                  });
                } catch (updateError) {
                  console.error('Error actualizando estado del evento:', updateError);
                }
              }
              errores.push('Este evento ya finalizó. No se pueden comprar más boletas.');
              continue;
            }
          } catch (eventoError) {
            console.error('Error obteniendo evento:', eventoError);
            // Continuar con otras validaciones aunque falle obtener el evento
          }
        }

        if (!tipoBoleta.activo) {
          errores.push(`El tipo de boleta "${tipoBoleta.nombre}" no está disponible`);
          continue;
        }

        if (tipoBoleta.cantidad_disponibles < item.cantidad) {
          errores.push(`Solo hay ${tipoBoleta.cantidad_disponibles} boletas disponibles de "${tipoBoleta.nombre}"`);
        }
      }

      return {
        valido: errores.length === 0,
        errores
      };
    } catch (error) {
      console.error('Error al validar disponibilidad:', error);
      return { valido: false, errores: ['Error al validar disponibilidad'] };
    }
  }

  /**
   * Procesa una compra completa: crea la compra y las boletas
   */
  async procesarCompra(datosCompra: DatosCompra): Promise<{ compra: Compra; boletas: BoletaComprada[] }> {
    try {
      // Calcular total
      const total = datosCompra.items.reduce((sum, item) => sum + (item.precio_unitario * item.cantidad), 0);

      // Crear la compra (sin método de pago, Wompi lo determinará)
      const compraData: Partial<Compra> = {
        cliente_id: datosCompra.cliente_id,
        evento_id: datosCompra.evento_id,
        numero_transaccion: this.generarNumeroTransaccion(),
        total: total,
        metodo_pago: datosCompra.metodo_pago, // Opcional
        estado_pago: TipoEstadoPago.PENDIENTE,
        estado_compra: TipoEstadoCompra.PENDIENTE,
        fecha_compra: this.timezoneService.getCurrentDateISO(),
        datos_facturacion: datosCompra.datos_facturacion
      };

      // Crear la compra
      const { data: compra, error: compraError } = await this.supabase
        .from('compras')
        .insert(compraData)
        .select()
        .single();

      if (compraError || !compra) {
        throw compraError || new Error('Error al crear la compra');
      }

      // Crear las boletas compradas
      const now = this.timezoneService.getCurrentDateISO();
      const boletasPromises = datosCompra.items.flatMap(item => {
        const boletas: Partial<BoletaComprada>[] = [];
        for (let i = 0; i < item.cantidad; i++) {
          boletas.push({
            compra_id: compra.id,
            tipo_boleta_id: item.tipo_boleta_id,
            codigo_qr: this.generarCodigoQR(),
            precio_unitario: item.precio_unitario,
            nombre_asistente: item.nombre_asistente,
            documento_asistente: item.documento_asistente,
            email_asistente: item.email_asistente,
            telefono_asistente: item.telefono_asistente,
            estado: TipoEstadoBoleta.PENDIENTE,
            fecha_creacion: now
          });
        }
        return boletas;
      });

      // Insertar todas las boletas
      // NOTA: La actualización de cantidad_vendidas y cantidad_disponibles
      // se maneja automáticamente por triggers en la base de datos
      const { data: boletas, error: boletasError } = await this.supabase
        .from('boletas_compradas')
        .insert(boletasPromises)
        .select();

      if (boletasError) {
        throw boletasError;
      }

      // No actualizamos manualmente las cantidades, el trigger lo hace
      console.log(`Boletas insertadas: ${boletas?.length || 0}. El trigger actualizará las cantidades.`);

      return { compra: compra as Compra, boletas: (boletas as BoletaComprada[]) || [] };
    } catch (error) {
      console.error('Error procesando compra:', error);
      throw error;
    }
  }

  /**
   * Actualiza las cantidades vendidas en tipos_boleta
   * Agrupa items por tipo_boleta_id para evitar actualizaciones duplicadas
   */
  private async actualizarCantidadesVendidas(items: ItemCompra[]): Promise<void> {
    try {
      // Agrupar items por tipo_boleta_id para sumar las cantidades
      const itemsAgrupados = new Map<number, number>();
      for (const item of items) {
        const cantidadActual = itemsAgrupados.get(item.tipo_boleta_id) || 0;
        itemsAgrupados.set(item.tipo_boleta_id, cantidadActual + item.cantidad);
      }

      // Actualizar cada tipo de boleta una sola vez
      for (const [tipoBoletaId, cantidadTotal] of itemsAgrupados.entries()) {
        try {
          // Obtener el tipo de boleta actual
          const { data: tipoBoleta, error: selectError } = await this.supabase
            .from('tipos_boleta')
            .select('cantidad_vendidas, cantidad_total, cantidad_disponibles')
            .eq('id', tipoBoletaId)
            .single();

          if (selectError || !tipoBoleta) {
            console.error('Error obteniendo tipo de boleta:', selectError);
            continue;
          }

          // Calcular nuevas cantidades basándose en los valores actuales
          const cantidadVendidasActual = tipoBoleta.cantidad_vendidas || 0;
          const nuevasVendidas = cantidadVendidasActual + cantidadTotal;
          const nuevasDisponibles = tipoBoleta.cantidad_total - nuevasVendidas;

          // Validar que no exceda el total
          if (nuevasVendidas > tipoBoleta.cantidad_total) {
            console.error(`Error: Intentando vender más boletas de las disponibles. Tipo: ${tipoBoletaId}, Vendidas: ${nuevasVendidas}, Total: ${tipoBoleta.cantidad_total}`);
            continue;
          }

          // Actualizar cantidades de forma atómica
          const { error: updateError } = await this.supabase
            .from('tipos_boleta')
            .update({
              cantidad_vendidas: nuevasVendidas,
              cantidad_disponibles: nuevasDisponibles
            })
            .eq('id', tipoBoletaId);

          if (updateError) {
            console.error('Error actualizando cantidad vendida:', updateError);
            throw updateError;
          }

          console.log(`Actualizado tipo boleta ${tipoBoletaId}: vendidas=${nuevasVendidas} (+${cantidadTotal}), disponibles=${nuevasDisponibles}`);
        } catch (error) {
          console.error(`Error actualizando cantidad vendida para tipo ${tipoBoletaId}:`, error);
          throw error;
        }
      }
    } catch (error) {
      console.error('Error en actualizarCantidadesVendidas:', error);
      throw error;
    }
  }

  /**
   * Obtiene una compra por ID
   */
  async getCompraById(compraId: number): Promise<Compra> {
    try {
      const { data, error } = await this.supabase
        .from('compras')
        .select('*')
        .eq('id', compraId)
        .single();

      if (error) {
        throw error;
      }

      return data as Compra;
    } catch (error) {
      console.error('Error obteniendo compra por ID:', error);
      throw error;
    }
  }

  /**
   * Confirma el pago de una compra
   */
  async confirmarPago(compraId: number): Promise<Compra> {
    try {
      const { data, error } = await this.supabase
        .from('compras')
        .update({
          estado_pago: TipoEstadoPago.COMPLETADO,
          estado_compra: TipoEstadoCompra.CONFIRMADA,
          fecha_confirmacion: this.timezoneService.getCurrentDateISO()
        })
        .eq('id', compraId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data as Compra;
    } catch (error) {
      console.error('Error confirmando pago:', error);
      throw error;
    }
  }
}

