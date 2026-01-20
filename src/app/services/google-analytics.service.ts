/* ============================================
   GOOGLE TAG MANAGER SERVICE
   ============================================ */

import { Injectable } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { environment } from '../../environments/environment';

declare let dataLayer: any[];

@Injectable({
  providedIn: 'root'
})
export class GoogleAnalyticsService {
  private gtmId: string | undefined;

  constructor(private router: Router) {
    this.gtmId = environment.googleTagManagerId;
    
    // Solo inicializar si estamos en producción y tenemos un ID
    if (this.gtmId && environment.production) {
      this.init();
    }
  }

  /**
   * Inicializa el tracking de navegación
   */
  private init() {
    // Inicializar dataLayer si no existe
    if (typeof window !== 'undefined') {
      (window as any).dataLayer = (window as any).dataLayer || [];
    }
    
    // Trackear navegación de páginas
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        this.trackPageView(event.urlAfterRedirects);
      });
  }

  /**
   * Trackea una vista de página
   */
  trackPageView(url: string) {
    if (!this.gtmId || !environment.production) return;
    
    try {
      if (typeof window !== 'undefined' && (window as any).dataLayer) {
        (window as any).dataLayer.push({
          event: 'page_view',
          page_path: url
        });
      }
    } catch (error) {
      console.error('Error tracking page view:', error);
    }
  }

  /**
   * Trackea un evento personalizado
   * @param eventName Nombre del evento
   * @param eventParams Parámetros adicionales del evento
   */
  trackEvent(eventName: string, eventParams?: Record<string, any>) {
    if (!this.gtmId || !environment.production) return;
    
    try {
      if (typeof window !== 'undefined' && (window as any).dataLayer) {
        (window as any).dataLayer.push({
          event: eventName,
          ...eventParams
        });
      }
    } catch (error) {
      console.error('Error tracking event:', error);
    }
  }

  /**
   * Trackea una compra completada
   * @param value Valor total de la compra
   * @param transactionId ID de la transacción
   * @param currency Moneda (por defecto: COP)
   * @param items Items comprados (opcional)
   */
  trackPurchase(
    value: number, 
    transactionId: string, 
    currency: string = 'COP',
    items?: Array<{
      item_id?: string;
      item_name?: string;
      price?: number;
      quantity?: number;
    }>
  ) {
    if (!this.gtmId || !environment.production) return;
    
    try {
      if (typeof window !== 'undefined' && (window as any).dataLayer) {
        (window as any).dataLayer.push({
          event: 'purchase',
          transaction_id: transactionId,
          value: value,
          currency: currency,
          items: items || []
        });
      }
    } catch (error) {
      console.error('Error tracking purchase:', error);
    }
  }

  /**
   * Trackea el inicio de sesión
   * @param method Método de inicio de sesión (email, google, etc.)
   */
  trackLogin(method?: string) {
    if (!this.gtmId || !environment.production) return;
    
    try {
      if (typeof window !== 'undefined' && (window as any).dataLayer) {
        (window as any).dataLayer.push({
          event: 'login',
          method: method || 'email'
        });
      }
    } catch (error) {
      console.error('Error tracking login:', error);
    }
  }

  /**
   * Trackea el registro de un nuevo usuario
   * @param method Método de registro (email, google, etc.)
   */
  trackRegistration(method?: string) {
    if (!this.gtmId || !environment.production) return;
    
    try {
      if (typeof window !== 'undefined' && (window as any).dataLayer) {
        (window as any).dataLayer.push({
          event: 'sign_up',
          method: method || 'email'
        });
      }
    } catch (error) {
      console.error('Error tracking registration:', error);
    }
  }

  /**
   * Trackea una búsqueda
   * @param searchTerm Término de búsqueda
   */
  trackSearch(searchTerm: string) {
    if (!this.gtmId || !environment.production) return;
    
    try {
      if (typeof window !== 'undefined' && (window as any).dataLayer) {
        (window as any).dataLayer.push({
          event: 'search',
          search_term: searchTerm
        });
      }
    } catch (error) {
      console.error('Error tracking search:', error);
    }
  }

  /**
   * Trackea la visualización de un evento
   * @param eventoId ID del evento
   * @param eventoTitulo Título del evento
   */
  trackEventoView(eventoId: number, eventoTitulo: string) {
    if (!this.gtmId || !environment.production) return;
    
    try {
      if (typeof window !== 'undefined' && (window as any).dataLayer) {
        (window as any).dataLayer.push({
          event: 'view_item',
          item_id: eventoId.toString(),
          item_name: eventoTitulo,
          item_category: 'evento'
        });
      }
    } catch (error) {
      console.error('Error tracking evento view:', error);
    }
  }

  /**
   * Trackea el inicio de un proceso de compra
   * @param eventoId ID del evento
   * @param value Valor total
   */
  trackBeginCheckout(eventoId: number, value: number) {
    if (!this.gtmId || !environment.production) return;
    
    try {
      if (typeof window !== 'undefined' && (window as any).dataLayer) {
        (window as any).dataLayer.push({
          event: 'begin_checkout',
          value: value,
          currency: 'COP',
          items: [{
            item_id: eventoId.toString(),
            item_category: 'evento'
          }]
        });
      }
    } catch (error) {
      console.error('Error tracking begin checkout:', error);
    }
  }

  /**
   * Trackea la adición de un item al carrito
   * @param eventoId ID del evento
   * @param eventoTitulo Título del evento
   * @param precio Precio del item
   */
  trackAddToCart(eventoId: number, eventoTitulo: string, precio: number) {
    if (!this.gtmId || !environment.production) return;
    
    try {
      if (typeof window !== 'undefined' && (window as any).dataLayer) {
        (window as any).dataLayer.push({
          event: 'add_to_cart',
          currency: 'COP',
          value: precio,
          items: [{
            item_id: eventoId.toString(),
            item_name: eventoTitulo,
            price: precio,
            quantity: 1
          }]
        });
      }
    } catch (error) {
      console.error('Error tracking add to cart:', error);
    }
  }
}
