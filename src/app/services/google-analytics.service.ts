/* ============================================
   GOOGLE ANALYTICS SERVICE
   ============================================
   Funnel GA4 + Meta Pixel (mismos puntos).
   Modelo ticketing (Humanitix):
   - item_name = boleta / producto / cover
   - item_category = título del evento
   - item_category2 = boleta | producto | cover

   Visitas GA4: una sola estrategia — gtag config (carga) + medición mejorada
   por History API en la propiedad GA4. Angular NO emite page_view a GA
   (evita duplicar con pushState/replaceState). Meta Pixel sí en NavigationEnd.

   Ecommerce: `value` = suma (price × qty − discount) de items.
   Cargo Eventum va aparte como `service_fee` (no infla value vs items).
*/

import { Injectable, inject } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { MetaPixelService } from './meta-pixel.service';
import { GaItem, sumGaItemsValue, claimGaPurchaseTrackingId, hasGaPurchaseTrackingId } from './ga-purchase.utils';

export type { GaItem } from './ga-purchase.utils';
export { sumGaItemsValue } from './ga-purchase.utils';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const PURCHASE_TRACKED_KEY = 'eventum_ga_purchase_tracked';
const META_PURCHASE_TRACKED_KEY = 'eventum_meta_purchase_queued';
const BEGIN_CHECKOUT_TRACKED_KEY = 'eventum_ga_begin_checkout';
const CHECKOUT_ITEMS_KEY = 'eventum_ga_checkout_items';
const FUNNEL_KEY = 'eventum_checkout_funnel_v1';
type FunnelState = { fingerprint: string; startedAt: number; steps: string[]; loginPending: boolean };

/** Motivos de bloqueo en checkout (sin PII). */
export type CheckoutObstacleReason =
  | 'session_required'
  | 'availability'
  | 'incomplete_data'
  | 'pending_checkout'
  | 'payment_error'
  | 'payment_rejected'
  | 'event_unavailable'
  | 'cart_conflict';

export type GaCheckoutItemsSnapshot = {
  /** Suma ecommerce de ítems (sin cargo de servicio). */
  value: number;
  /** Cargo Eventum; no forma parte de `value`. */
  service_fee?: number;
  currency: 'COP';
  items: GaItem[];
  coupon?: string | null;
  descuento_total?: number;
  evento_titulo?: string | null;
  fingerprint?: string;
  saved_at?: number;
};

@Injectable({
  providedIn: 'root'
})
export class GoogleAnalyticsService {
  private googleTagId: string | undefined;
  private readonly metaPixel = inject(MetaPixelService);
  private scriptLoading: Promise<void> | null = null;
  private gtagReady = false;
  private readonly purchasesInFlight = new Set<string>();
  private readonly purchasesProcessed = new Set<string>();
  private readonly metaPurchasesQueued = new Set<string>();
  private funnel: FunnelState | null = null;
  private readonly funnelInFlight = new Set<string>();
  private readonly paymentsStarted = new Set<string>();

  private funnelState(fingerprint: string): FunnelState {
    if (!this.funnel) {
      try {
        const stored = JSON.parse(this.purchaseStorage()?.getItem(FUNNEL_KEY) || 'null');
        if (stored && typeof stored.fingerprint === 'string' && Array.isArray(stored.steps) &&
            typeof stored.startedAt === 'number') this.funnel = stored;
      } catch { /* Storage no disponible. */ }
    }
    if (!this.funnel || this.funnel.fingerprint !== fingerprint || Date.now() - this.funnel.startedAt > 86400000) {
      this.funnel = { fingerprint, startedAt: Date.now(), steps: [], loginPending: false };
      this.persistFunnel();
    }
    return this.funnel;
  }

  private persistFunnel(): void {
    try { this.purchaseStorage()?.setItem(FUNNEL_KEY, JSON.stringify(this.funnel)); } catch { /* Memoria como respaldo. */ }
  }

  private async trackFunnelStep(name: string, fingerprint: string, params: Record<string, unknown> = {}): Promise<boolean> {
    if (!fingerprint || !this.canTrackConfig()) return false;
    const state = this.funnelState(fingerprint);
    const key = `${state.startedAt}:${fingerprint}:${name}`;
    if (state.steps.includes(name) || this.funnelInFlight.has(key)) return false;
    this.funnelInFlight.add(key);
    try {
      const processed = await this.sendEventAndWait(params, name);
      if (processed) {
        state.steps.push(name);
        if (this.funnel === state) this.persistFunnel();
      }
      return processed;
    } finally { this.funnelInFlight.delete(key); }
  }

  trackCartViewed(fingerprint: string, items: GaItem[]): void {
    if (!items.length) return;
    void this.trackFunnelStep('view_cart', fingerprint, { currency: 'COP', value: sumGaItemsValue(items), items });
  }

  trackCheckoutLoginRequired(fingerprint: string): void {
    const state = this.funnelState(fingerprint);
    state.loginPending = true;
    this.persistFunnel();
    void this.trackFunnelStep('checkout_login_required', fingerprint);
  }

  trackCheckoutLoginCompleted(fingerprint: string): void {
    const state = this.funnelState(fingerprint);
    if (!state.loginPending) return;
    void this.trackFunnelStep('checkout_login_completed', fingerprint).then(processed => {
      if (processed && this.funnel === state) {
        state.loginPending = false;
        this.persistFunnel();
      }
    });
  }

  private purchaseStorage(): Storage | null {
    try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null; }
    catch { return null; }
  }

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
    if (this.canTrackConfig()) {
      void this.ensureGtag();
    }

    // Solo Meta en SPA; GA4 page_view viene de config + Enhanced Measurement (History).
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.metaPixel.trackPageView();
      });
  }

  /** Config de entorno permite medir (sin exigir gtag ya cargado). */
  private canTrackConfig(): boolean {
    return !!(this.googleTagId && environment.production && typeof window !== 'undefined');
  }

  private canTrack(): boolean {
    return this.canTrackConfig() && this.gtagReady && typeof window.gtag === 'function';
  }

  private ensureGtag(): Promise<void> {
    if (!this.canTrackConfig() || !this.googleTagId) {
      return Promise.resolve();
    }
    if (this.gtagReady && typeof window.gtag === 'function') {
      return Promise.resolve();
    }
    if (this.scriptLoading) {
      return this.scriptLoading;
    }

    this.scriptLoading = new Promise<void>((resolve) => {
      try {
        window.dataLayer = window.dataLayer || [];

        // Preferir el stub oficial (index.html en prod). No reemplazar si ya existe.
        if (typeof window.gtag !== 'function') {
          window.gtag = function gtag(this: void) {
            // eslint-disable-next-line prefer-rest-params
            window.dataLayer!.push(arguments);
          };
          window.gtag('js', new Date());
          // page_view inicial; SPA vía Enhanced Measurement (History) en GA4 Admin.
          window.gtag('config', this.googleTagId, { send_page_view: true });
        }

        const existing = document.querySelector('script[data-eventum-gtag]');
        if (existing) {
          this.gtagReady = true;
          resolve();
          return;
        }

        const script = document.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(this.googleTagId!)}`;
        script.setAttribute('data-eventum-gtag', '1');
        script.onload = () => {
          this.gtagReady = true;
          resolve();
        };
        script.onerror = () => {
          this.gtagReady = false;
          this.scriptLoading = null;
          script.remove();
          resolve();
        };
        document.head.appendChild(script);
      } catch {
        resolve();
      }
    });

    return this.scriptLoading;
  }

  private sendEvent(eventName: string, eventParams?: Record<string, unknown>): void {
    if (!this.canTrackConfig()) return;
    void this.ensureGtag().then(() => {
      if (!this.canTrack()) return;
      try {
        window.gtag!('event', eventName, eventParams || {});
      } catch (error) {
        console.error(`Error tracking ${eventName}:`, error);
      }
    });
  }

  /** @deprecated GA ya no emite page_view manual; solo Meta si hace falta forzar. */
  trackPageView(_url?: string) {
    this.metaPixel.trackPageView();
  }

  trackEvent(eventName: string, eventParams?: Record<string, unknown>) {
    this.sendEvent(eventName, eventParams);
  }

  async trackPurchase(
    value: number,
    transactionId: string,
    currency: string = 'COP',
    items?: GaItem[],
    serviceFee?: number
  ): Promise<boolean> {
    const gaItems = items || [];
    const itemsValue = gaItems.length ? sumGaItemsValue(gaItems) : Number(value) || 0;
    const fee = Math.max(0, Number(serviceFee) || 0);
    const params = {
      transaction_id: transactionId,
      value: itemsValue,
      currency: currency,
      items: gaItems,
      payment_gateway: 'wompi',
      total_paid: itemsValue + fee,
      ...(fee > 0 ? { service_fee: fee } : {}),
    };
    const storage = this.purchaseStorage();
    let pixelQueued = this.metaPurchasesQueued.has(transactionId) ||
      hasGaPurchaseTrackingId(transactionId, storage, META_PURCHASE_TRACKED_KEY);
    if (!pixelQueued) pixelQueued = this.metaPixel.trackPurchase({
      value: itemsValue,
      transactionId,
      contents: gaItems.map((item) => ({
        id: String(item.item_id || 'item'),
        quantity: Math.max(1, Number(item.quantity) || 1),
        item_price: Number(item.price) || undefined,
      })),
    });
    if (pixelQueued) {
      this.metaPurchasesQueued.add(transactionId);
      claimGaPurchaseTrackingId(transactionId, storage, META_PURCHASE_TRACKED_KEY);
    }
    if (!this.canTrackConfig()) return pixelQueued;
    return this.sendEventAndWait(params);
  }

  /** Callback confirms gtag processing, not receipt in GA reports. Timeout never counts as success. */
  private sendEventAndWait(params: Record<string, unknown>, eventName = 'purchase', timeoutMs = 8000): Promise<boolean> {
    return new Promise(resolve => {
      let settled = false;
      const finish = (processed: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(processed);
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      void this.ensureGtag().then(() => {
        if (settled) return;
        if (!this.canTrack()) { finish(false); return; }
        try {
          window.gtag!('event', eventName, {
            ...params,
            event_callback: () => finish(true),
            // Our failure deadline must precede gtag's timeout callback.
            event_timeout: timeoutMs + 2000,
          });
        } catch { finish(false); }
      }).catch(() => finish(false));
    });
  }

  async trackPurchaseOnce(
    value: number,
    transactionId: string,
    currency: string = 'COP',
    items?: GaItem[],
    serviceFee?: number
  ): Promise<boolean> {
    const id = String(transactionId || '').trim();
    const pixelId = (environment as { metaPixelId?: string }).metaPixelId?.trim();
    const canPixel = !!(pixelId && environment.production);
    if (!id || (!this.canTrackConfig() && !canPixel)) return false;

    const gaItems = items || [];
    const itemsValue = gaItems.length ? sumGaItemsValue(gaItems) : Number(value) || 0;
    if (!gaItems.length || !(itemsValue > 0)) {
      console.warn('[GA4] purchase omitido (trackPurchaseOnce): items vacíos o value <= 0', {
        transaction_id: id,
        items_count: gaItems.length,
        value: itemsValue,
      });
      return false;
    }

    const storage = this.purchaseStorage();
    if (this.purchasesInFlight.has(id) || this.purchasesProcessed.has(id) ||
        hasGaPurchaseTrackingId(id, storage, PURCHASE_TRACKED_KEY)) {
      return false;
    }
    this.purchasesInFlight.add(id);
    const funnelBeforePurchase = this.funnel;
    let storedFunnelBeforePurchase: string | null = null;
    try { storedFunnelBeforePurchase = storage?.getItem(FUNNEL_KEY) ?? null; } catch { /* ignore */ }
    try {
      const processed = await this.trackPurchase(itemsValue, id, currency, gaItems, serviceFee);
      if (!processed) return false;
      this.purchasesProcessed.add(id);
      claimGaPurchaseTrackingId(id, storage, PURCHASE_TRACKED_KEY);
      // No borrar el intento nuevo que pudo empezar durante la espera.
      if (this.funnel === funnelBeforePurchase) {
        this.funnel = null;
        try {
          if (storage?.getItem(FUNNEL_KEY) === storedFunnelBeforePurchase) storage.removeItem(FUNNEL_KEY);
        } catch { /* ignore */ }
      }
      return true;
    } catch {
      return false;
    } finally {
      this.purchasesInFlight.delete(id);
    }
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
    const eventoIdStr = String(params.eventoId);
    const gaItems: GaItem[] = (params.items || [])
      .filter((i) => i.name || i.id != null)
      // Nunca enviar el evento como si fuera un SKU (formato legacy id=evento / ca=evento).
      .filter((i) => {
        const category = String(i.category || '').toLowerCase();
        if (category === 'evento') return false;
        const id = String(i.id);
        if (id === eventoIdStr && (i.name || '') === eventoTitulo) return false;
        return true;
      })
      .map((i) => ({
        item_id: String(i.id),
        item_name: i.name || String(i.id),
        price: Number(i.price) || 0,
        quantity: 1,
        item_category: eventoTitulo,
        item_category2: i.category || 'boleta',
      }));

    if (gaItems.length > 0) {
      const value = gaItems.reduce(
        (sum, item) =>
          sum + (Number(item.price) || 0) * Math.max(1, Number(item.quantity) || 1),
        0,
      );
      this.sendEvent('view_item', {
        currency: 'COP',
        value,
        items: gaItems,
      });
    } else {
      this.sendEvent('view_evento', {
        evento_id: eventoIdStr,
        evento_titulo: eventoTitulo,
      });
    }

    this.metaPixel.trackViewContent({
      contentId: params.eventoId,
      contentName: eventoTitulo,
      contentCategory: gaItems[0]?.item_category2 || 'evento',
      value: gaItems[0]?.price,
    });
  }

  /**
   * Inicio de checkout → begin_checkout / InitiateCheckout
   * Disparar en la intención de pagar (antes de exigir sesión).
   */
  trackBeginCheckout(params: {
    value?: number;
    items?: GaItem[];
    serviceFee?: number;
    /** Solo para Meta / contexto; no se usa como item_name. */
    eventoTitulo?: string;
    coupon?: string | null;
    fingerprint?: string;
  }) {
    const items = (params.items || []).filter((i) => i.item_name || i.item_id);
    const itemsValue = items.length
      ? sumGaItemsValue(items)
      : Number(params.value) || 0;
    const fee = Math.max(0, Number(params.serviceFee) || 0);
    const payload = {
      value: itemsValue,
      currency: 'COP',
      coupon: params.coupon || undefined,
      ...(fee > 0 ? { service_fee: fee } : {}),
      items: items.length
        ? items
        : [{
            item_id: 'checkout',
            item_name: 'Checkout',
            item_category: 'checkout',
            item_category2: params.eventoTitulo,
          }],
    };
    void this.trackFunnelStep('begin_checkout', params.fingerprint || 'checkout', payload);
    this.metaPixel.trackInitiateCheckout({
      contentId: items[0]?.item_id,
      contentName: items[0]?.item_name || params.eventoTitulo,
      contentCategory: items[0]?.item_category || 'checkout',
      value: itemsValue,
      numItems: items.reduce((n, i) => n + Math.max(1, Number(i.quantity) || 1), 0) || 1,
    });
  }

  /**
   * Una vez por fingerprint de carrito en la pestaña (evita spam si falla login y reintenta).
   */
  trackBeginCheckoutOnce(params: {
    value?: number;
    items?: GaItem[];
    serviceFee?: number;
    eventoTitulo?: string;
    coupon?: string | null;
    fingerprint: string;
  }): boolean {
    const fp = String(params.fingerprint || '').trim();
    const items = params.items || [];
    const itemsValue = items.length
      ? sumGaItemsValue(items)
      : Number(params.value) || 0;
    const fee = Math.max(0, Number(params.serviceFee) || 0);

    if (!fp) {
      this.trackBeginCheckout(params);
      this.saveCheckoutItemsSnapshot({
        value: itemsValue,
        service_fee: fee,
        items,
        coupon: params.coupon,
        evento_titulo: params.eventoTitulo,
        fingerprint: fp,
      });
      return true;
    }

    try {
      const state = this.funnelState(fp);
      if (state.steps.includes('begin_checkout') || this.funnelInFlight.has(`${state.startedAt}:${fp}:begin_checkout`)) {
        return false;
      }
    } catch {
      // Continuar sin dedupe si storage falla.
    }

    this.trackBeginCheckout(params);
    this.saveCheckoutItemsSnapshot({
      value: itemsValue,
      service_fee: fee,
      items,
      coupon: params.coupon,
      evento_titulo: params.eventoTitulo,
      fingerprint: fp,
    });
    return true;
  }

  /**
   * Salida hacia Wompi. No implica que el usuario añadió información de pago.
   */
  async trackPaymentStarted(params: {
    value?: number;
    items?: GaItem[];
    serviceFee?: number;
    paymentType?: string;
    paymentGateway?: string;
    coupon?: string | null;
    paymentId: string;
  }): Promise<void> {
    const items = (params.items || []).filter((i) => i.item_name || i.item_id);
    const itemsValue = items.length
      ? sumGaItemsValue(items)
      : Number(params.value) || 0;
    const fee = Math.max(0, Number(params.serviceFee) || 0);
    const storageKey = 'eventum_payment_started';
    const id = params.paymentId;
    if (!id || this.paymentsStarted.has(id) || this.funnelInFlight.has(`payment:${id}`) || hasGaPurchaseTrackingId(id, this.purchaseStorage(), storageKey)) return;
    this.funnelInFlight.add(`payment:${id}`);
    try {
      const processed = await this.sendEventAndWait({
        currency: 'COP',
        value: itemsValue,
        payment_type: params.paymentType || 'wompi',
        payment_gateway: params.paymentGateway || 'wompi',
        coupon: params.coupon || undefined,
        ...(fee > 0 ? { service_fee: fee } : {}),
        items,
      }, 'payment_started', 800);
      if (processed) {
        this.paymentsStarted.add(id);
        claimGaPurchaseTrackingId(id, this.purchaseStorage(), storageKey);
      }
    } finally { this.funnelInFlight.delete(`payment:${id}`); }
  }

  /** Bloqueos del embudo (GA custom + Meta trackCustom). Sin PII. */
  trackCheckoutObstacle(params: {
    reason: CheckoutObstacleReason;
    step?: string;
  }) {
    const reason = params.reason;
    const step = params.step || 'checkout';
    this.sendEvent('checkout_obstacle', { reason, step });
    this.metaPixel.trackCheckoutObstacle({ reason, step });
  }

  saveCheckoutItemsSnapshot(snapshot: {
    value: number;
    service_fee?: number;
    items: GaItem[];
    coupon?: string | null;
    descuento_total?: number;
    evento_titulo?: string | null;
    fingerprint?: string;
  }): void {
    if (typeof sessionStorage === 'undefined') return;
    try {
      const prev = this.readCheckoutItemsSnapshot();
      const items = snapshot.items || [];
      const feeProvided = snapshot.service_fee != null && Number.isFinite(Number(snapshot.service_fee));
      const payload: GaCheckoutItemsSnapshot = {
        value: items.length ? sumGaItemsValue(items) : Number(snapshot.value) || 0,
        // No pisar fee previo si el caller no lo envía.
        service_fee: feeProvided
          ? Math.max(0, Number(snapshot.service_fee) || 0)
          : Math.max(0, Number(prev?.service_fee) || 0),
        currency: 'COP',
        items,
        coupon: snapshot.coupon ?? prev?.coupon ?? null,
        descuento_total:
          snapshot.descuento_total != null
            ? snapshot.descuento_total
            : prev?.descuento_total,
        evento_titulo:
          snapshot.evento_titulo !== undefined
            ? snapshot.evento_titulo
            : prev?.evento_titulo ?? null,
        fingerprint: snapshot.fingerprint ?? prev?.fingerprint,
        saved_at: Date.now(),
      };
      sessionStorage.setItem(CHECKOUT_ITEMS_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }

  readCheckoutItemsSnapshot(): GaCheckoutItemsSnapshot | null {
    if (typeof sessionStorage === 'undefined') return null;
    try {
      const raw = sessionStorage.getItem(CHECKOUT_ITEMS_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as GaCheckoutItemsSnapshot;
    } catch {
      return null;
    }
  }

  clearCheckoutItemsSnapshot(): void {
    if (typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.removeItem(CHECKOUT_ITEMS_KEY);
    } catch {
      // ignore
    }
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
    const eventTitle = String(params.itemCategory || '').trim();

    // Nueva intención de compra → permitir begin_checkout otra vez al entrar al carrito.
    this.clearBeginCheckoutDedupe();

    this.sendEvent('add_to_cart', {
      currency: 'COP',
      value: price * quantity,
      items: [{
        item_id: String(params.itemId),
        item_name: params.itemName,
        // Categoría = contexto del evento; tipo de SKU siempre en category2.
        item_category: eventTitle || undefined,
        item_category2: tipoSku,
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

  /** Permite volver a emitir begin_checkout (mismo carrito tras reintento / add_to_cart). */
  clearBeginCheckoutDedupe(): void {
    if (typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.removeItem(BEGIN_CHECKOUT_TRACKED_KEY);
    } catch {
      // ignore
    }
  }
}
