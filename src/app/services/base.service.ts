/* ============================================
   BASE SERVICE - Utilidades comunes para servicios
   ============================================ */

import { Observable, from } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

/**
 * Maneja la respuesta de Supabase y convierte errores en excepciones
 */
export function handleSupabaseResponse<T>(response: any): T {
  if (response.error) {
    console.error('Error de Supabase:', response.error);
    throw response.error;
  }
  return response.data as T;
}

/**
 * Maneja la respuesta paginada de Supabase
 */
export function handlePaginatedResponse<T>(
  response: any,
  page: number,
  limit: number
): { data: T[]; total: number; page: number; limit: number; totalPages: number } {
  if (response.error) {
    console.error('Error de Supabase:', response.error);
    throw response.error;
  }
  
  const total = response.count || 0;
  const data = (response.data as T[]) || [];
  
  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
}

/**
 * Crea un Observable desde una promesa de Supabase con manejo de errores
 */
export function fromSupabase<T>(promise: Promise<any>): Observable<T> {
  return from(promise).pipe(
    map((response) => {
      if (response.error) {
        console.error('Error de Supabase:', response.error);
        throw response.error;
      }
      return response.data as T;
    }),
    catchError((error) => {
      console.error('Error en Observable:', error);
      return throwError(() => error);
    })
  );
}



