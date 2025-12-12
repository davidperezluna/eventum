/* ============================================
   SUPABASE OBSERVABLE HELPER
   Helper para crear Observables desde promesas de Supabase con NgZone
   ============================================ */

import { NgZone, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SupabaseObservableHelper {
  constructor(private ngZone: NgZone) {}

  /**
   * Convierte una promesa de Supabase en un Observable usando NgZone
   */
  fromSupabase<T>(promise: PromiseLike<any>): Observable<T> {
    return new Observable<T>(observer => {
      this.ngZone.runOutsideAngular(() => {
        Promise.resolve(promise).then((response: any) => {
          this.ngZone.run(() => {
            if (response.error) {
              console.error('Error de Supabase:', response.error);
              observer.error(response.error);
            } else {
              observer.next(response);
              observer.complete();
            }
          });
        }).catch((error: any) => {
          this.ngZone.run(() => {
            observer.error(error);
          });
        });
      });
    });
  }
}



