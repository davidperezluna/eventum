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
  transaccion_checkout_id?: number;
  transaccion_producto_id?: number;
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
   * Consulta el estado de un checkout Wompi por payment link id.
   */
  async obtenerEstadoTransaccion(transactionId: string): Promise<{
    wompi_status?: string;
    estado?: string;
  } | null> {
    try {
      const { data, error } = await this.supabase
        .from('transacciones_checkout')
        .select('wompi_status, estado')
        .eq('wompi_transaction_id', transactionId)
        .maybeSingle();

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
