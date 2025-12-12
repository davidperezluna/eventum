import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { SupabaseService } from './supabase.service';

export interface WompiPaymentData {
  payment_method_type?: 'CARD' | 'PSE' | 'NEQUI' | 'BANCOLOMBIA_TRANSFER' | 'BANCOLOMBIA_COLLECT';
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
  crearTransaccion(compraId: number, datosPago: WompiPaymentData): Observable<WompiTransactionResponse> {
    return from(
      this.supabase.functions.invoke('wompi-payment', {
        body: {
          compra_id: compraId,
          datos_pago: datosPago
        }
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('Error en función Wompi:', error);
          throw error;
        }
        return data as WompiTransactionResponse;
      }),
      catchError((error) => {
        console.error('Error creando transacción Wompi:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Obtiene el estado de una transacción de Wompi
   */
  obtenerEstadoTransaccion(transactionId: string): Observable<any> {
    // Esta función puede llamar a la API de Wompi directamente si es necesario
    // Por ahora, el webhook se encarga de actualizar el estado
    return from(
      this.supabase
        .from('compras')
        .select('wompi_status, estado_pago, estado_compra')
        .eq('wompi_transaction_id', transactionId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data;
      }),
      catchError((error) => throwError(() => error))
    );
  }
}

