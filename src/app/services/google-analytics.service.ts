/* ============================================
   GOOGLE ANALYTICS SERVICE
   ============================================ */

import { Injectable } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { environment } from '../../environments/environment';

declare let gtag: Function;

const PURCHASE_TRACKED_KEY = 'eventum_ga_purchase_tracked';

@Injectable({
  providedIn: 'root'
})
export class GoogleAnalyticsService {
  private googleTagId: string | undefined;

  constructor(private router: Router) {
    this.googleTagId = environment.googleTagId;

    // Solo inicializar si estamos en producción y tenemos un ID
    if (this.googleTagId && environment.production) {
      this.init();
    }
  }

  /**
   * Inicializa el tracking de navegación
   */
  private init() {
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.trackPageView(event.urlAfterRedirects);
      });
  }

  private canTrack(): boolean {
    return !!(
      this.googleTagId &&
      environment.production &&
      typeof window !== 'undefined' &&
      typeof gtag !== 'undefined'
    );
  }

  private sendEvent(eventName: string, eventParams?: Record<string, unknown>): void {
    if (!this.canTrack()) return;
    try {
      gtag('event', eventName, eventParams || {});
    } catch (error) {
      console.error(`Error tracking ${eventName}:`, error);
    }
  }

  /**
   * Trackea una vista de página (SPA)
   */
  trackPageView(url: string) {
    if (!this.canTrack()) return;

    try {
      gtag('config', this.googleTagId, {
        page_path: url
      });
    } catch (error) {
      console.error('Error tracking page view:', error);
    }
  }

  /**
   * Trackea un evento personalizado
   */
  trackEvent(eventName: string, eventParams?: Record<string, unknown>) {
    this.sendEvent(eventName, eventParams);
  }

  /**
   * Trackea una compra completada.
   * Usar `trackPurchaseOnce` cuando la pantalla pueda reintentar/recargar.
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
      item_category?: string;
    }>
  ) {
    this.sendEvent('purchase', {
      transaction_id: transactionId,
      value: value,
      currency: currency,
      items: items || []
    });
  }

  /**
   * Dispara `purchase` una sola vez por transactionId (sessionStorage).
   * Evita duplicados en `/pago-resultado` con reintentos.
   */
  trackPurchaseOnce(
    value: number,
    transactionId: string,
    currency: string = 'COP',
    items?: Array<{
      item_id?: string;
      item_name?: string;
      price?: number;
      quantity?: number;
      item_category?: string;
    }>
  ): boolean {
    const id = String(transactionId || '').trim();
    if (!id || !this.canTrack()) return false;

    try {
      const raw = sessionStorage.getItem(PURCHASE_TRACKED_KEY);
      const tracked: string[] = raw ? (JSON.parse(raw) as string[]) : [];
      if (tracked.includes(id)) {
        return false;
      }
      tracked.push(id);
      sessionStorage.setItem(PURCHASE_TRACKED_KEY, JSON.stringify(tracked.slice(-50)));
    } catch {
      // Si sessionStorage falla, igual intentamos trackear una vez en esta carga.
    }

    this.trackPurchase(value, id, currency, items);
    return true;
  }

  trackLogin(method?: string) {
    this.sendEvent('login', { method: method || 'email' });
  }

  trackRegistration(method?: string) {
    this.sendEvent('sign_up', { method: method || 'email' });
  }

  trackSearch(searchTerm: string) {
    this.sendEvent('search', { search_term: searchTerm });
  }

  /**
   * Visualización de detalle de evento → view_item
   */
  trackEventoView(eventoId: number, eventoTitulo: string) {
    this.sendEvent('view_item', {
      currency: 'COP',
      items: [{
        item_id: eventoId.toString(),
        item_name: eventoTitulo,
        item_category: 'evento'
      }]
    });
  }

  /**
   * Inicio de checkout → begin_checkout
   */
  trackBeginCheckout(params: {
    value: number;
    itemId?: string | number;
    itemName?: string;
    itemCategory?: string;
  }) {
    const itemId = params.itemId != null ? String(params.itemId) : 'checkout';
    this.sendEvent('begin_checkout', {
      value: params.value,
      currency: 'COP',
      items: [{
        item_id: itemId,
        item_name: params.itemName || undefined,
        item_category: params.itemCategory || 'evento'
      }]
    });
  }

  /**
   * Agregar al carrito → add_to_cart
   */
  trackAddToCart(params: {
    itemId: string | number;
    itemName: string;
    price: number;
    itemCategory?: string;
    quantity?: number;
  }) {
    const price = Number(params.price) || 0;
    const quantity = Math.max(1, Number(params.quantity) || 1);

    this.sendEvent('add_to_cart', {
      currency: 'COP',
      value: price * quantity,
      items: [{
        item_id: String(params.itemId),
        item_name: params.itemName,
        item_category: params.itemCategory || 'evento',
        price,
        quantity
      }]
    });
  }
}
