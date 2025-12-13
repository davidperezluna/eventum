/* ============================================
   SUPABASE OBSERVABLE HELPER
   Helper para crear Observables desde promesas de Supabase con NgZone
   ============================================ */

import { NgZone, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface SupabaseResponse<T = any> {
  data: T | null;
  error: any;
  count?: number | null;
}

@Injectable({
  providedIn: 'root'
})
export class SupabaseObservableHelper {
  constructor(private ngZone: NgZone) {}

  /**
   * Convierte una promesa de Supabase en un Observable usando NgZone
   * Asegura que el Observable siempre se complete correctamente
   * @param promise La promesa de Supabase
   * @param timeout Tiempo de espera en milisegundos (por defecto 15 segundos)
   */
  fromSupabase<T = any>(promise: PromiseLike<any>, timeout: number = 15000): Observable<SupabaseResponse<T>> {
    return new Observable<SupabaseResponse<T>>(observer => {
      let completed = false;
      
      this.ngZone.runOutsideAngular(() => {
        Promise.resolve(promise)
          .then((response: any) => {
            if (completed) return;
            
            this.ngZone.run(() => {
              // Si la respuesta ya tiene la estructura de SupabaseResponse, usarla directamente
              // Si no, normalizarla
              if (response && typeof response === 'object' && ('data' in response || 'error' in response)) {
                // Ya es una respuesta de Supabase o SupabaseResponse
                if (response.error) {
                  console.error('Error de Supabase:', response.error);
                  observer.error(response.error);
                } else {
                  const supabaseResponse: SupabaseResponse<T> = {
                    data: response.data ?? null,
                    error: response.error ?? null,
                    count: response.count ?? null
                  };
                  observer.next(supabaseResponse);
                }
              } else {
                // Si la respuesta es directamente el dato (de funciones async), envolverlo
                const supabaseResponse: SupabaseResponse<T> = {
                  data: response ?? null,
                  error: null,
                  count: null
                };
                observer.next(supabaseResponse);
              }
              observer.complete();
              completed = true;
            });
          })
          .catch((error: any) => {
            if (completed) return;
            
            this.ngZone.run(() => {
              console.error('Error en promesa de Supabase:', error);
              observer.error(error);
              observer.complete();
              completed = true;
            });
          });
      });

      // Timeout de seguridad para evitar Observables que nunca se completen
      const timeoutId = setTimeout(() => {
        if (!completed) {
          this.ngZone.run(() => {
            console.warn(`Timeout en promesa de Supabase después de ${timeout}ms, forzando completado`);
            if (!completed) {
              observer.error(new Error(`Timeout: La promesa de Supabase no se resolvió a tiempo (${timeout}ms)`));
              observer.complete();
              completed = true;
            }
          });
        }
      }, timeout);
      
      // Limpiar timeout si el observable se completa antes
      return () => {
        clearTimeout(timeoutId);
      };
    });
  }
}
