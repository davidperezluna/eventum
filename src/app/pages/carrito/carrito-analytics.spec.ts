import '@angular/compiler';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Carrito } from './carrito';

// Exercise the page's analytics entry points without invoking payment/auth backends.
describe('cart analytics entry points', () => {
  let page: any;
  let analytics: any;
  const items = [{ item_id: '1', item_category2: 'boleta', price: 100, quantity: 1 }];
  beforeEach(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    analytics = {
      trackCartViewed: vi.fn(), trackCheckoutLoginCompleted: vi.fn(),
      trackCheckoutLoginRequired: vi.fn(), trackBeginCheckoutOnce: vi.fn(),
      readCheckoutItemsSnapshot: vi.fn().mockReturnValue(null), saveCheckoutItemsSnapshot: vi.fn(),
    };
    page = Object.create(Carrito.prototype);
    Object.assign(page, {
      googleAnalytics: analytics, usuario: null, sesionAnaliticaValidada: false,
      evento: { id: 1, titulo: 'Evento' }, buildGaItemsFromCart: () => items,
      getValorServicio: () => 0, getDescuento: () => 0,
    });
    Object.defineProperty(page, 'mostrarLoadingCarrito', { configurable: true, value: false });
  });

  it('only measures visible, loaded carts with articles', () => {
    Object.defineProperty(page, 'mostrarLoadingCarrito', { value: true, configurable: true });
    page.trackCarritoVisible();
    expect(analytics.trackCartViewed).not.toHaveBeenCalled();
    Object.defineProperty(page, 'mostrarLoadingCarrito', { value: false });
    page.trackCarritoVisible();
    expect(analytics.trackCartViewed).toHaveBeenCalledOnce();
    page.buildGaItemsFromCart = () => [];
    page.trackCarritoVisible();
    expect(analytics.trackCartViewed).toHaveBeenCalledOnce();
  });

  it('records anonymous checkout intent before requesting login', () => {
    page.continuarAlLogin();
    expect(analytics.trackBeginCheckoutOnce).toHaveBeenCalledOnce();
    const fingerprint = analytics.trackBeginCheckoutOnce.mock.calls[0][0].fingerprint;
    expect(analytics.trackCheckoutLoginRequired).toHaveBeenCalledWith(fingerprint);
    expect(analytics.trackBeginCheckoutOnce.mock.invocationCallOrder[0])
      .toBeLessThan(analytics.trackCheckoutLoginRequired.mock.invocationCallOrder[0]);
  });

  it('requires a validated session before completing the checkout login', () => {
    page.usuario = { id: 1 };
    page.trackCarritoVisible();
    expect(analytics.trackCheckoutLoginCompleted).not.toHaveBeenCalled();
    page.sesionAnaliticaValidada = true;
    page.trackCarritoVisible();
    expect(analytics.trackCheckoutLoginCompleted).toHaveBeenCalledOnce();
  });

  it('keeps cart identity when authentication restores a discount', () => {
    expect(page.buildGaCheckoutFingerprint(items)).toBe(
      page.buildGaCheckoutFingerprint([{ ...items[0], discount: 10 }]),
    );
    expect(page.buildGaCheckoutFingerprint(items)).not.toBe(
      page.buildGaCheckoutFingerprint([{ ...items[0], quantity: 2 }]),
    );
  });
});
