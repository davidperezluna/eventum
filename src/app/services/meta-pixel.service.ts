/* ============================================
   META (FACEBOOK) PIXEL
   ============================================
   Por ahora: un solo Pixel global (organizador cliente).
   Solo producción. Mismos puntos del funnel que GA4.
*/

import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

@Injectable({
  providedIn: 'root',
})
export class MetaPixelService {
  private readonly pixelId = (environment as { metaPixelId?: string }).metaPixelId?.trim() || '';
  private scriptLoaded = false;

  /** Carga el base del Pixel (una vez). PageView solo vía router (SPA); History auto OFF. */
  init(): void {
    if (!this.canTrack() || this.scriptLoaded || typeof window === 'undefined') {
      return;
    }
    this.scriptLoaded = true;
    this.injectBaseScript();
  }

  trackPageView(): void {
    this.track('PageView');
  }

  trackViewContent(params: {
    contentId: string | number;
    contentName: string;
    contentCategory?: string;
    value?: number;
  }): void {
    this.track('ViewContent', {
      content_ids: [String(params.contentId)],
      content_name: params.contentName,
      content_type: 'product',
      content_category: params.contentCategory || 'evento',
      value: params.value,
      currency: 'COP',
    });
  }

  trackAddToCart(params: {
    contentId: string | number;
    contentName: string;
    contentCategory?: string;
    value: number;
    quantity?: number;
  }): void {
    this.track('AddToCart', {
      content_ids: [String(params.contentId)],
      content_name: params.contentName,
      content_type: 'product',
      content_category: params.contentCategory || 'evento',
      value: params.value,
      currency: 'COP',
      contents: [
        {
          id: String(params.contentId),
          quantity: Math.max(1, Number(params.quantity) || 1),
          item_price: params.value,
        },
      ],
    });
  }

  trackInitiateCheckout(params: {
    contentId?: string | number;
    contentName?: string;
    contentCategory?: string;
    value: number;
    numItems?: number;
  }): void {
    this.track('InitiateCheckout', {
      content_ids: params.contentId != null ? [String(params.contentId)] : undefined,
      content_name: params.contentName,
      content_category: params.contentCategory || 'evento',
      content_type: 'product',
      value: params.value,
      currency: 'COP',
      num_items: Math.max(1, Number(params.numItems) || 1),
    });
  }

  trackAddPaymentInfo(params: {
    value: number;
    contents?: Array<{ id: string; quantity: number; item_price?: number }>;
  }): void {
    this.track('AddPaymentInfo', {
      value: params.value,
      currency: 'COP',
      content_type: 'product',
      contents: params.contents,
      content_ids: params.contents?.map((c) => c.id),
    });
  }

  /** Custom: bloqueos del embudo (sin PII). */
  trackCheckoutObstacle(params: { reason: string; step?: string }): void {
    this.trackCustom('CheckoutObstacle', {
      reason: params.reason,
      step: params.step || 'checkout',
    });
  }

  trackPurchase(params: {
    value: number;
    transactionId: string;
    contents?: Array<{ id: string; quantity: number; item_price?: number }>;
  }): boolean {
    const eventID = String(params.transactionId || '').trim();
    return this.track(
      'Purchase',
      {
        value: params.value,
        currency: 'COP',
        content_type: 'product',
        contents: params.contents,
        content_ids: params.contents?.map((c) => c.id),
        // order_id + eventID = mismo id canónico (chk-…); listo para dedupe Pixel + CAPI.
        order_id: eventID || undefined,
      },
      eventID ? { eventID } : undefined,
    );
  }

  private canTrack(): boolean {
    return !!(this.pixelId && environment.production && typeof window !== 'undefined');
  }

  private track(
    eventName: string,
    params?: Record<string, unknown>,
    eventData?: { eventID: string },
  ): boolean {
    if (!this.canTrack()) return false;
    this.init();
    try {
      const fbq = window.fbq;
      if (typeof fbq !== 'function') return false;
      if (params && eventData?.eventID) {
        fbq('track', eventName, params, eventData);
      } else if (params) {
        fbq('track', eventName, params);
      } else {
        fbq('track', eventName);
      }
      return true;
    } catch (error) {
      console.error(`Error tracking Meta Pixel ${eventName}:`, error);
      return false;
    }
  }

  private trackCustom(eventName: string, params?: Record<string, unknown>): void {
    if (!this.canTrack()) return;
    this.init();
    try {
      const fbq = window.fbq;
      if (typeof fbq !== 'function') return;
      if (params) {
        fbq('trackCustom', eventName, params);
      } else {
        fbq('trackCustom', eventName);
      }
    } catch (error) {
      console.error(`Error tracking Meta Pixel custom ${eventName}:`, error);
    }
  }

  private injectBaseScript(): void {
    if (typeof document === 'undefined') return;

    // Stub oficial de Meta (cola hasta que cargue fbevents.js)
    const w = window as Window & {
      fbq?: ((...args: unknown[]) => void) & {
        disablePushState?: boolean;
        allowDuplicatePageViews?: boolean;
      };
      _fbq?: unknown;
    };
    if (!w.fbq) {
      const n: any = function (...args: unknown[]) {
        // eslint-disable-next-line prefer-spread, prefer-rest-params
        (n.callMethod ? n.callMethod.apply(n, args) : n.queue.push(args));
      };
      if (!w._fbq) w._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = '2.0';
      n.queue = [] as unknown[];
      w.fbq = n;
    }

    // SPA: el Pixel escucha pushState/replaceState y manda PageView solo.
    // Angular ya emite PageView en NavigationEnd → sin esto hay duplicados.
    if (w.fbq) {
      w.fbq.disablePushState = true;
    }

    const existing = document.querySelector('script[data-eventum-meta-pixel]');
    if (!existing) {
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://connect.facebook.net/en_US/fbevents.js';
      script.setAttribute('data-eventum-meta-pixel', '1');
      const first = document.getElementsByTagName('script')[0];
      first?.parentNode?.insertBefore(script, first);
    }

    w.fbq?.('init', this.pixelId);
  }
}
