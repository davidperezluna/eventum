import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface WompiPaymentData {
  payment_method_type?: 'CARD' | 'PSE' | 'NEQUI' | 'BANCOLOMBIA_TRANSFER' | 'BANCOLOMBIA_COLLECT' | 'DAVIPLATA';
  installments?: number;
  redirect_url?: string;
}

export interface WompiTransactionResponse {
  success: boolean;
  transaction?: {
    id: string;
    status: string;
    checkout_url?: string;
    permalink?: string;
  };
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class WompiService {
  constructor(
    private supabase: SupabaseService
  ) {}

  /**
   * Crea una transacción en Wompi para una compra
   */
  async crearTransaccion(compraId: number, datosPago: WompiPaymentData): Promise<WompiTransactionResponse> {
    try {
      const { data, error } = await this.supabase.functions.invoke('wompi-payment', {
        body: {
          compra_id: compraId,
          datos_pago: datosPago
        }
      });

      if (error) {
        console.error('Error en función Wompi:', error);
        throw error;
      }

      return data as WompiTransactionResponse;
    } catch (error) {
      console.error('Error creando transacción Wompi:', error);
      throw error;
    }
  }

  /**
   * Obtiene el estado de una transacción de Wompi
   */
  async obtenerEstadoTransaccion(transactionId: string): Promise<any> {
    // Esta función puede llamar a la API de Wompi directamente si es necesario
    // Por ahora, el webhook se encarga de actualizar el estado
    try {
      const { data, error } = await this.supabase
        .from('compras')
        .select('wompi_status, estado_pago, estado_compra')
        .eq('wompi_transaction_id', transactionId)
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error obteniendo estado de transacción Wompi:', error);
      throw error;
    }
  }
}

