# Tracking Eventum (GA4 + Meta)

**Documentación canónica actualizada:** [`docs/tracking-ga4-meta.md`](docs/tracking-ga4-meta.md)

Ahí está el embudo completo (`view_item` → `purchase`), reglas de `value` / `service_fee`, page views SPA, Meta Pixel + `eventID` para CAPI, archivos y cómo probar.

---

## Resumen rápido

| Evento GA4 | Meta | Cuándo |
|---|---|---|
| page (History / config) | `PageView` | Navegación (estrategias distintas; ver doc) |
| `view_item` / `view_evento` | `ViewContent` | Detalle evento |
| `add_to_cart` | `AddToCart` | Sumar al carrito |
| `begin_checkout` | `InitiateCheckout` | Pulsar **Pagar** en `/carrito` |
| `add_payment_info` | `AddPaymentInfo` | Ir a Wompi |
| `purchase` | `Purchase` (+ `eventID`) | Pago `completado` en `/pago-resultado` |
| `checkout_obstacle` | `CheckoutObstacle` | Bloqueos del embudo |

**Money:** `value` = suma de ítems; `service_fee` aparte; `total_paid` = value + fee (solo en `purchase` GA4).

**Solo producción** en `eventumcol.com`. Local no mide.

---

## Ejemplo: vista de evento

```typescript
this.googleAnalytics.trackEventoView({
  eventoId: evento.id,
  eventoTitulo: evento.titulo,
  items: tiposBoleta.map((t) => ({
    id: t.id,
    name: t.nombre,
    price: t.precio,
    category: 'boleta',
  })),
});
```

## Ejemplo: add to cart

```typescript
this.googleAnalytics.trackAddToCart({
  itemId: tipo.id,
  itemName: tipo.nombre,
  price: tipo.precio,
  itemCategory: evento.titulo,
  itemCategory2: 'boleta',
  quantity: 1,
});
```

## Ejemplo: purchase (no llamar a mano desde el carrito)

El `purchase` lo dispara `/pago-resultado` vía `trackPurchaseOnce` cuando el estado es `completado`. No uses `trackPurchase` directo en el flujo Wompi salvo casos controlados.

```typescript
// Interno (pago-resultado) — id canónico chk-{checkoutId}
this.googleAnalytics.trackPurchaseOnce(
  payload.value,
  payload.transaction_id, // chk-123
  'COP',
  payload.items,
  payload.service_fee,
);
```

Meta recibe el mismo `value` de ítems y:

`fbq('track', 'Purchase', params, { eventID: transactionId })`.

---

## Mejores prácticas

1. No enviar PII (emails, documentos, tarjetas).
2. Mantener `item_name` = SKU y `item_category` = evento.
3. No meter el fee de Eventum dentro de `price` / `value`.
4. No duplicar `page_view` manual en Angular si GA Enhanced Measurement (History) está activo.
5. Validar con Tag Assistant + Events Manager tras deploy a prod.
