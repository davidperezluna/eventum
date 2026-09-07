import { describe, expect, it } from 'vitest';
import {
  buildGaItemsFromBoletaRows,
  buildGaPurchasePayload,
  claimGaPurchaseTrackingId,
  isSendableGaPurchase,
  shouldTrackGaPurchase,
  sumGaItemsValue,
} from './ga-purchase.utils';

describe('ga-purchase.utils', () => {
  it('completado → 1 purchase permitido', () => {
    expect(shouldTrackGaPurchase('completado')).toBe(true);
  });

  it('pendiente → 0 purchase', () => {
    expect(shouldTrackGaPurchase('pendiente')).toBe(false);
  });

  it('cover pendiente → 0 purchase', () => {
    expect(shouldTrackGaPurchase('pendiente')).toBe(false);
    expect(shouldTrackGaPurchase('otro')).toBe(false);
  });

  it('value / service_fee / total_paid / payment_gateway coherentes', () => {
    const items = [
      {
        item_id: '63',
        item_name: 'ZONA ALGUNA VEZ',
        price: 30000,
        quantity: 1,
        item_category: 'LA FACTORÍA / Alguna vez',
        item_category2: 'boleta',
      },
    ];
    const payload = buildGaPurchasePayload({
      transactionId: 'chk-100',
      items,
      serviceFee: 2400,
    });
    expect(payload).toEqual({
      transaction_id: 'chk-100',
      currency: 'COP',
      value: 30000,
      service_fee: 2400,
      total_paid: 32400,
      payment_gateway: 'wompi',
      items,
    });
    expect(sumGaItemsValue(items)).toBe(30000);
    expect(isSendableGaPurchase(payload)).toBe(true);
  });

  it('no envía purchase con items vacíos o value <= 0', () => {
    const empty = buildGaPurchasePayload({
      transactionId: 'chk-empty',
      items: [],
      serviceFee: 2400,
    });
    expect(isSendableGaPurchase(empty)).toBe(false);

    const zero = buildGaPurchasePayload({
      transactionId: 'chk-zero',
      items: [{ item_id: '1', item_name: 'X', price: 0, quantity: 1 }],
      serviceFee: 0,
    });
    expect(isSendableGaPurchase(zero)).toBe(false);
  });

  it('reconstruye ítems reales desde boletas (sin genérico ni fee en price)', () => {
    const items = buildGaItemsFromBoletaRows(
      [
        {
          tipo_boleta_id: 63,
          precio_unitario: 30000,
          tipos_boleta: { nombre: 'ZONA ALGUNA VEZ' },
        },
        {
          tipo_boleta_id: 63,
          precio_unitario: 30000,
          tipos_boleta: { nombre: 'ZONA ALGUNA VEZ' },
        },
        {
          tipo_boleta_id: 64,
          precio_unitario: 35000,
          tipos_boleta: { nombre: 'BACKSTAGE' },
        },
      ],
      'LA FACTORÍA / Alguna vez',
      0,
    );
    expect(items.map((i) => i.item_name)).toEqual(['ZONA ALGUNA VEZ', 'BACKSTAGE']);
    expect(items.every((i) => i.item_name !== 'Boletas')).toBe(true);
    expect(sumGaItemsValue(items)).toBe(95000);
  });

  it('palcos: 1 grupo = 1 unidad comercial (no filas de asientos)', () => {
    const items = buildGaItemsFromBoletaRows(
      [
        {
          tipo_boleta_id: 10,
          precio_unitario: 200000,
          grupo_palco_id: 'g1',
          consume_inventario: true,
          tipos_boleta: { nombre: 'PALCO VIP' },
        },
        {
          tipo_boleta_id: 10,
          precio_unitario: 0,
          grupo_palco_id: 'g1',
          consume_inventario: false,
          tipos_boleta: { nombre: 'PALCO VIP' },
        },
        {
          tipo_boleta_id: 10,
          precio_unitario: 0,
          grupo_palco_id: 'g1',
          consume_inventario: false,
          tipos_boleta: { nombre: 'PALCO VIP' },
        },
        {
          tipo_boleta_id: 10,
          precio_unitario: 200000,
          grupo_palco_id: 'g2',
          consume_inventario: true,
          tipos_boleta: { nombre: 'PALCO VIP' },
        },
        {
          tipo_boleta_id: 10,
          precio_unitario: 0,
          grupo_palco_id: 'g2',
          consume_inventario: false,
          tipos_boleta: { nombre: 'PALCO VIP' },
        },
      ],
      'Evento Palcos',
      0,
    );
    expect(items).toEqual([
      {
        item_id: '10',
        item_name: 'PALCO VIP',
        price: 200000,
        quantity: 2,
        item_category: 'Evento Palcos',
        item_category2: 'boleta',
      },
    ]);
    expect(sumGaItemsValue(items)).toBe(400000);
  });

  it('mismo transaction_id dos veces → 1 envío (claim)', () => {
    const store: Record<string, string> = {};
    const storage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    };

    expect(claimGaPurchaseTrackingId('chk-42', storage)).toBe(true);
    expect(claimGaPurchaseTrackingId('chk-42', storage)).toBe(false);
    expect(claimGaPurchaseTrackingId('chk-99', storage)).toBe(true);
  });
});
