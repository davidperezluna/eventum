import '@angular/compiler';
import { getTestBed, TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleAnalyticsService } from './google-analytics.service';
import { MetaPixelService } from './meta-pixel.service';

vi.mock('../../environments/environment', () => ({ environment: {
  production: true, googleTagId: 'TEST-LOCAL-ONLY', metaPixelId: 'test-pixel',
} }));
if (!getTestBed().platform) TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

const key = 'eventum_ga_purchase_tracked';
const items = [{ item_id: 'test-item', item_name: 'Entrada', price: 100, quantity: 1 }];
let service: GoogleAnalyticsService;
let gtag: ReturnType<typeof vi.fn>;
let pixelPurchase: ReturnType<typeof vi.fn>;
const send = () => service.trackPurchaseOnce(100, 'test-order', 'COP', items);
const callback = () => gtag.mock.calls.find(call => call[1] === 'purchase')![2].event_callback as () => void;

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  document.head.innerHTML = '<script data-eventum-gtag="1"></script>';
  window.gtag = gtag = vi.fn();
  pixelPurchase = vi.fn().mockReturnValue(true);
  TestBed.configureTestingModule({ providers: [GoogleAnalyticsService,
    { provide: Router, useValue: { events: new Subject() } },
    { provide: MetaPixelService, useValue: { init: vi.fn(), trackPageView: vi.fn(), trackPurchase: pixelPurchase, trackInitiateCheckout: vi.fn() } },
  ] });
  service = TestBed.runInInjectionContext(() => new GoogleAnalyticsService(TestBed.inject(Router)));
});
afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete window.gtag;
  document.head.innerHTML = '';
});

describe('purchase tracking confirmation', () => {
  it('persists only after the callback and blocks concurrent and completed duplicates', async () => {
    const pending = send();
    await Promise.resolve();
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(await send()).toBe(false);
    expect(gtag).toHaveBeenCalledTimes(1);
    callback()();
    expect(await pending).toBe(true);
    expect(JSON.parse(sessionStorage.getItem(key)!)).toEqual(['test-order']);
    expect(await send()).toBe(false);
  });

  it('keeps a timed-out purchase retryable and ignores late callbacks without repeating Meta', async () => {
    const pending = send();
    await Promise.resolve();
    const late = callback();
    await vi.advanceTimersByTimeAsync(8000);
    expect(await pending).toBe(false);
    late();
    expect(sessionStorage.getItem(key)).toBeNull();
    gtag.mockClear();
    const retry = send();
    await Promise.resolve();
    callback()();
    expect(await retry).toBe(true);
    expect(pixelPurchase).toHaveBeenCalledTimes(1);
  });

  it('allows retry after gtag throws', async () => {
    gtag.mockImplementationOnce(() => { throw new Error('blocked'); });
    expect(await send()).toBe(false);
    expect(sessionStorage.getItem(key)).toBeNull();
    gtag.mockClear();
    const retry = send();
    await Promise.resolve();
    callback()();
    expect(await retry).toBe(true);
  });

  it('retains in-memory deduplication when storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const pending = send();
    await Promise.resolve();
    callback()();
    expect(await pending).toBe(true);
    expect(await send()).toBe(false);
    expect(gtag).toHaveBeenCalledTimes(1);
  });
});

describe('checkout funnel', () => {
  const fingerprint = 'event:test|boleta:test-item:1';
  const begin = () => service.trackBeginCheckoutOnce({ fingerprint, items });
  const names = () => gtag.mock.calls.filter(call => call[0] === 'event').map(call => call[1]);
  const reload = () => {
    service = TestBed.runInInjectionContext(() => new GoogleAnalyticsService(TestBed.inject(Router)));
  };
  beforeEach(() => {
    gtag.mockImplementation((_command, _name, params) => params?.event_callback?.());
  });

  it('tracks the authenticated path through purchase without login steps', async () => {
    service.trackCartViewed(fingerprint, items);
    begin();
    service.trackCheckoutLoginCompleted(fingerprint);
    await service.trackPaymentStarted({ paymentId: 'payment-1', items });
    expect(await send()).toBe(true);
    expect(names()).toEqual(['view_cart', 'begin_checkout', 'payment_started', 'purchase']);
  });

  it('tracks anonymous intent and resumes the same purchase after login across a reload', async () => {
    service.trackCartViewed(fingerprint, items);
    begin();
    service.trackCheckoutLoginRequired(fingerprint);
    await vi.advanceTimersByTimeAsync(0);
    reload();
    service.trackCartViewed(fingerprint, items);
    service.trackCheckoutLoginCompleted(fingerprint);
    begin();
    await service.trackPaymentStarted({ paymentId: 'payment-1', items });
    expect(await send()).toBe(true);
    expect(names()).toEqual(['view_cart', 'begin_checkout', 'checkout_login_required',
      'checkout_login_completed', 'payment_started', 'purchase']);
  });

  it('does not attribute login completion to a different cart or to an expired attempt', async () => {
    begin();
    service.trackCheckoutLoginRequired(fingerprint);
    await vi.advanceTimersByTimeAsync(0);
    service.trackCheckoutLoginCompleted('another-cart');
    service.trackCheckoutLoginRequired('another-cart');
    await vi.advanceTimersByTimeAsync(86400001);
    service.trackCheckoutLoginCompleted('another-cart');
    expect(names()).not.toContain('checkout_login_completed');
  });

  it('deduplicates renders, repeated clicks and reloads, but accepts a different payment', async () => {
    service.trackCartViewed(fingerprint, []);
    expect(names()).toEqual([]);
    for (let i = 0; i < 3; i++) {
      service.trackCartViewed(fingerprint, items);
      begin();
    }
    await Promise.all([1, 2, 3].map(() => service.trackPaymentStarted({ paymentId: 'payment-1', items })));
    reload();
    service.trackCartViewed(fingerprint, items);
    begin();
    await service.trackPaymentStarted({ paymentId: 'payment-1', items });
    await service.trackPaymentStarted({ paymentId: 'payment-2', items });
    expect(names()).toEqual(['view_cart', 'begin_checkout', 'payment_started', 'payment_started']);
    expect(names()).not.toContain('add_payment_info');
  });

  it('does not mark failed steps as processed and bounds the wait before payment', async () => {
    gtag.mockImplementation(() => {});
    const pending = service.trackPaymentStarted({ paymentId: 'payment-1', items });
    await vi.advanceTimersByTimeAsync(800);
    await pending;
    expect(sessionStorage.getItem('eventum_payment_started')).toBeNull();
    gtag.mockImplementation((_command, _name, params) => params?.event_callback?.());
    await service.trackPaymentStarted({ paymentId: 'payment-1', items });
    expect(names()).toEqual(['payment_started', 'payment_started']);
  });

  it('allows a fresh cart journey after a confirmed purchase', async () => {
    service.trackCartViewed(fingerprint, items);
    begin();
    await vi.advanceTimersByTimeAsync(0);
    await send();
    service.trackCartViewed(fingerprint, items);
    begin();
    await vi.advanceTimersByTimeAsync(0);
    expect(names()).toEqual(['view_cart', 'begin_checkout', 'purchase', 'view_cart', 'begin_checkout']);
  });
});
