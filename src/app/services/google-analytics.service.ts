/* ============================================
   GOOGLE ANALYTICS SERVICE
   ============================================
   Funnel GA4 + Meta Pixel (mismos puntos).
   Modelo ticketing (Humanitix):
   - item_name = boleta / producto / cover
   - item_category = título del evento
   - item_category2 = boleta | producto | cover
*/

import { Injectable, inject } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { MetaPixelService } from './meta-pixel.service';

declare let gtag: Function;

const PURCHASE_TRACKED_KEY = 'eventum_ga_purchase_tracked';

export type GaItem = {
  item_id?: string;
  item_name?: string;
  price?: number;
  quantity?: number;
  /** Título del evento (contexto del SKU). */
  item_category?: string;
  /** boleta | producto | cover */
  item_category2?: string;
};

@Injectable({
  providedIn: 'root'
})
export class GoogleAnalyticsService {
  private googleTagId: string | undefined;
  private readonly metaPixel = inject(MetaPixelService);

  constructor(private router: Router) {
    this.googleTagId = environment.googleTagId;

    const hasGa = !!(this.googleTagId && environment.production);
    const hasPixel = !!(
      (environment as { metaPixelId?: string }).metaPixelId?.trim() &&
      environment.production
    );

    if (hasGa || hasPixel) {
      this.init();
    }
    if (hasPixel) {
      this.metaPixel.init();
    }
  }

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

  trackPageView(url: string) {
    if (this.canTrack()) {
      try {
        gtag('config', this.googleTagId, {
          page_path: url
        });
      } catch (error) {
        console.error('Error tracking page view:', error);
      }
    }
    this.metaPixel.trackPageView();
  }

  trackEvent(eventName: string, eventParams?: Record<string, unknown>) {
    this.sendEvent(eventName, eventParams);
  }

  trackPurchase(
    value: number,
    transactionId: string,
    currency: string = 'COP',
    items?: GaItem[]
  ) {
    this.sendEvent('purchase', {
      transaction_id: transactionId,
      value: value,
      currency: currency,
      items: items || []
    });
    this.metaPixel.trackPurchase({
      value,
      transactionId,
      contents: (items || []).map((item) => ({
        id: String(item.item_id || 'item'),
        quantity: Math.max(1, Number(item.quantity) || 1),
        item_price: Number(item.price) || undefined,
      })),
    });
  }

  trackPurchaseOnce(
    value: number,
    transactionId: string,
    currency: string = 'COP',
    items?: GaItem[]
  ): boolean {
    const id = String(transactionId || '').trim();
    const pixelId = (environment as { metaPixelId?: string }).metaPixelId?.trim();
    const canPixel = !!(pixelId && environment.production);
    if (!id || (!this.canTrack() && !canPixel)) return false;

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
   * Vista de detalle de evento (modelo ticketing).
   * GA `view_item`: item_name = boleta/producto, item_category = título del evento.
   * Sin ítems (evento sin boletas): `view_evento` custom (no ensucia el reporte de artículos).
   * Meta: ViewContent con el nombre del evento (anuncios).
   */
  trackEventoView(params: {
    eventoId: number;
    eventoTitulo: string;
    items?: Array<{
      id: string | number;
      name: string;
      price?: number;
      /** boleta | producto | cover */
      category?: string;
    }>;
  }) {
    const eventoTitulo = params.eventoTitulo || `Evento ${params.eventoId}`;
    const gaItems: GaItem[] = (params.items || [])
      .filter((i) => i.name || i.id != null)
      .map((i) => ({
        item_id: String(i.id),
        item_name: i.name || String(i.id),
        price: Number(i.price) || 0,
        quantity: 1,
        item_category: eventoTitulo,
        item_category2: i.category || 'boleta',
      }));

    if (gaItems.length > 0) {
      const value = gaItems.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
      this.sendEvent('view_item', {
        currency: 'COP',
        value,
        items: gaItems,
      });
    } else {
      this.sendEvent('view_evento', {
        evento_id: String(params.eventoId),
        evento_titulo: eventoTitulo,
      });
    }

    this.metaPixel.trackViewContent({
      contentId: params.eventoId,
      contentName: eventoTitulo,
      contentCategory: 'evento',
      value: gaItems[0]?.price,
    });
  }

  /**
   * Inicio de checkout → begin_checkout / InitiateCheckout
   * `items` deben ser boletas/productos/covers del carrito.
   */
  trackBeginCheckout(params: {
    value: number;
    items?: GaItem[];
    /** Solo para Meta / contexto; no se usa como item_name. */
    eventoTitulo?: string;
  }) {
    const items = (params.items || []).filter((i) => i.item_name || i.item_id);
    this.sendEvent('begin_checkout', {
      value: params.value,
      currency: 'COP',
      items: items.length
        ? items
        : [{
            item_id: 'checkout',
            item_name: 'Checkout',
            item_category: 'checkout',
            item_category2: params.eventoTitulo,
          }],
    });
    this.metaPixel.trackInitiateCheckout({
      contentId: items[0]?.item_id,
      contentName: items[0]?.item_name || params.eventoTitulo,
      contentCategory: items[0]?.item_category || 'checkout',
      value: params.value,
    });
  }

  /**
   * Agregar al carrito → add_to_cart / AddToCart
   * item_name = boleta/producto/cover
   * item_category = título del evento (si hay)
   * item_category2 = boleta | producto | cover
   */
  trackAddToCart(params: {
    itemId: string | number;
    itemName: string;
    price: number;
    /** Título del evento (Humanitix: Item category). */
    itemCategory?: string;
    /** boleta | producto | cover */
    itemCategory2?: string;
    quantity?: number;
  }) {
    const price = Number(params.price) || 0;
    const quantity = Math.max(1, Number(params.quantity) || 1);
    const tipoSku = params.itemCategory2 || 'boleta';

    this.sendEvent('add_to_cart', {
      currency: 'COP',
      value: price * quantity,
      items: [{
        item_id: String(params.itemId),
        item_name: params.itemName,
        item_category: params.itemCategory || tipoSku,
        item_category2: params.itemCategory ? tipoSku : undefined,
        price,
        quantity
      }]
    });
    this.metaPixel.trackAddToCart({
      contentId: params.itemId,
      contentName: params.itemName,
      contentCategory: tipoSku,
      value: price * quantity,
      quantity,
    });
  }
}
