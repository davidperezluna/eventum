# Tracking Eventum — GA4 + Meta Pixel

Documentación canónica del funnel de medición en producción (`eventumcol.com`).

Docs antiguas de setup GTM (`GOOGLE_ANALYTICS_SETUP.md`, `CONFIGURAR_GA4_EN_GTM.md`, `VERIFICAR_GOOGLE_ANALYTICS.md`) describen un flujo GTM opcional/histórico; **hoy el sitio usa `gtag` directo**, no el snippet GTM.

---

## 1. IDs y entorno

| Pieza | Valor / ubicación |
|---|---|
| Google Tag | `GT-5TJZWP3P` (`src/index.html`, solo host prod) |
| GA4 Measurement ID | `G-46BBJ0FKE1` (propiedad vinculada al tag) |
| Meta Pixel | `metaPixelId` en `environment.prod.ts` |
| Cuándo mide | `environment.production === true` **y** host `eventumcol.com` / `www.eventumcol.com` |
| Localhost / `npm start` | **No** carga gtag ni Pixel |

Archivos clave:

- `src/index.html` — bootstrap gtag (`send_page_view: true`)
- `src/app/services/google-analytics.service.ts` — eventos GA4 + orquesta Meta
- `src/app/services/meta-pixel.service.ts` — Pixel
- `src/app/services/ga-purchase.utils.ts` — helpers de `purchase` (ítems, value, dedupe claim)
- `src/app/pages/carrito/carrito.ts` — `begin_checkout`, `add_payment_info`, obstáculos
- `src/app/pages/pago-resultado/pago-resultado.ts` — `purchase` / `Purchase`
- `src/app/pages/detalle-evento/detalle-evento.ts` — `view_item`
- `src/app/services/carrito-compra.service.ts` — `add_to_cart`

Tests: `src/app/services/ga-purchase.utils.spec.ts`.

---

## 2. Modelo de ítems (ticketing)

Igual en todo el funnel ecommerce:

| Campo GA4 | Significado en Eventum |
|---|---|
| `item_id` | ID del tipo de boleta / `producto-{id}` / `cover-{tipoId}` |
| `item_name` | Nombre del tipo (SKU), **no** el evento |
| `item_category` | Título del evento (o lugar en covers) |
| `item_category2` | `boleta` \| `producto` \| `cover` |
| `price` | Precio unitario **sin** cargo de servicio |
| `quantity` | Unidades comerciales (en palcos: 1 por `grupo_palco_id`, no por asiento) |
| `discount` | Parte del descuento de cupón asignada a la línea (si aplica) |

---

## 3. Embudo implementado

```
Detalle evento
  → view_item (o view_evento si no hay SKUs)
  → Meta ViewContent

Agregar al carrito
  → add_to_cart
  → Meta AddToCart

Pulsar Pagar en /carrito
  → begin_checkout (+ service_fee)
  → Meta InitiateCheckout

Redirect a Wompi
  → add_payment_info (+ service_fee, payment_gateway: wompi)
  → Meta AddPaymentInfo

Pago confirmado (estado completado) en /pago-resultado
  → purchase (+ service_fee, total_paid, payment_gateway)
  → Meta Purchase (mismo momento; eventID = transaction_id)
```

Obstáculos (custom, sin PII):

- GA4: `checkout_obstacle` `{ reason, step }`
- Meta: `CheckoutObstacle` (trackCustom)

Razones típicas: `session_required`, `availability`, `incomplete_data`, `pending_checkout`, `payment_rejected`, `event_unavailable`, `cart_conflict`, …

---

## 4. Page views (SPA)

| Canal | Estrategia |
|---|---|
| **GA4** | Carga inicial: `send_page_view: true` en `index.html`. Navegación SPA: **Enhanced Measurement → History API** en la propiedad GA4. Angular **no** emite `page_view` manual (evita duplicados). |
| **Meta** | Un solo `PageView` por `NavigationEnd`. Se desactiva el listener automático de History del Pixel (`fbq.disablePushState = true`) para no duplicar con el tracking manual. |

En GA4 Admin debe permanecer activa la medición de cambios de historial.

---

## 5. Eventos ecommerce — detalle

### `view_item` / `view_evento`

- **Dónde:** `detalle-evento` → `trackEventoView`
- Con tipos/productos → `view_item` (`value` = suma de precios mostrados)
- Sin ítems → `view_evento` custom
- Meta: siempre `ViewContent` con el **nombre del evento**

### `add_to_cart`

- **Dónde:** `CarritoCompraService` al agregar boleta/producto/cover
- Limpia dedupe de `begin_checkout` para permitir un nuevo inicio de checkout
- Meta: `AddToCart`

### `begin_checkout`

- **Dónde:** solo al pulsar **Pagar** en `/carrito` (`trackBeginCheckoutIntent`), **no** al entrar al carrito
- **No** se vuelve a disparar al “recuperar pago pendiente” (evita inflar el embudo)
- `value` = Σ (price × qty − discount) de ítems
- `service_fee` = cargo Eventum (aparte)
- `currency`: `COP`
- Snapshot en `sessionStorage` (`eventum_ga_checkout_items`) para el `purchase` posterior
- Meta: `InitiateCheckout` con el mismo `value` de ítems

### `add_payment_info`

- **Dónde:** justo antes del redirect a Wompi (flujo normal o recuperar pendiente)
- Mismos `items` / `value` / `service_fee`
- `payment_type`: hoy `"wompi"` (procesador; método card/PSE pendiente si Wompi lo expone)
- `payment_gateway`: `"wompi"`
- Meta: `AddPaymentInfo`

### `purchase` / Meta `Purchase`

- **Dónde:** únicamente `PagoResultado.trackPurchaseSiCompletado`
- **Solo** si estado unificado = `completado` (checkout `aprobada`, `estado_pago` completado, covers incluidos)
- **No** por solo abrir `/pago-resultado`, ni `PENDING` / rechazado
- **No** envía si `items` vacío o `value <= 0` (warn en consola; **no** marca dedupe)
- `transaction_id` estable:
  - Preferido: `chk-{transaccion_checkout_id}`
  - Fallbacks: `compra-{id}`, `prod-{id}`, `cover-{id}`, `txn-prod-{id}`, `wompi-{id}`
- Payload GA4:
  - `value` = suma ítems (sin fee)
  - `service_fee` (si > 0)
  - `total_paid` = value + service_fee
  - `payment_gateway`: `wompi`
  - `currency`: `COP`
  - `items`: del snapshot del carrito **o** reconstrucción desde DB (boletas/productos/covers; palcos por `grupo_palco_id`)
- Dedupe browser: `sessionStorage` key `eventum_ga_purchase_tracked` (lista de ids)
- Meta (mismo gate, mismo `value` de ítems):
  ```js
  fbq('track', 'Purchase', {
    value, currency: 'COP', content_type: 'product',
    contents, content_ids, order_id: transactionId
  }, { eventID: transactionId });
  ```
- `eventID` = mismo id canónico → listo para deduplicar Pixel + **Meta Conversions API** (CAPI aún no implementada en backend)

---

## 6. Money rules (importante)

Ejemplo: boleta $30.000 + fee Eventum $2.400 → Wompi cobra $32.400.

| Campo | Valor |
|---|---|
| `items[].price` / `value` | `30000` |
| `service_fee` | `2400` |
| `total_paid` (solo GA4 purchase) | `32400` |

El fee **nunca** va dentro de `price` ni de `value` ecommerce.

---

## 7. Equivalencia GA4 ↔ Meta

| GA4 | Meta | Notas |
|---|---|---|
| History / config page_view | `PageView` | Estrategias distintas (ver §4) |
| `view_item` / `view_evento` | `ViewContent` | Meta usa nombre del evento |
| `add_to_cart` | `AddToCart` | |
| `begin_checkout` | `InitiateCheckout` | |
| `add_payment_info` | `AddPaymentInfo` | |
| `purchase` | `Purchase` | Mismo momento; Meta usa `eventID` |
| `checkout_obstacle` | `CheckoutObstacle` | Custom |

Helpers en `GoogleAnalyticsService` llaman al Pixel en el mismo método; no hace falta cablear Meta página por página.

---

## 8. Métodos públicos útiles

```typescript
// google-analytics.service.ts
trackEventoView({ eventoId, eventoTitulo, items? })
trackAddToCart({ itemId, itemName, price, itemCategory?, itemCategory2?, quantity? })
trackBeginCheckoutOnce({ items, serviceFee?, fingerprint, ... })
trackAddPaymentInfo({ items, serviceFee?, paymentType?, paymentGateway? })
trackPurchaseOnce(value, transactionId, 'COP', items, serviceFee?)
trackCheckoutObstacle({ reason, step? })
trackLogin / trackRegistration / trackSearch / trackEvent
```

---

## 9. Cómo probar

1. Deploy a producción (o build prod en `eventumcol.com`).
2. Tag Assistant / GA DebugView + Meta Events Manager (Test events).
3. Embudo limpio: pestaña nueva → evento → carrito → Pagar → Wompi → pago **APPROVED** → `/pago-resultado`.
4. Verificar en Tag Assistant:
   - Un `begin_checkout` al pagar (value = ítems)
   - `add_payment_info` al ir a Wompi
   - Un solo `purchase` con `transaction_id` estable, `value` sin fee, `service_fee`, `total_paid`
5. Unit tests locales (sin Wompi):

```bash
npx vitest run src/app/services/ga-purchase.utils.spec.ts
npx tsc -p tsconfig.app.json --noEmit
```

---

## 10. Pendiente / no hacer

- No reactivar `page_view` manual en Angular si History Enhanced Measurement sigue ON.
- No disparar `begin_checkout` al entrar al carrito ni al recuperar pendiente.
- CAPI: cuando se implemente, reutilizar `event_id` = `transaction_id` / `eventID` del Pixel.
- Opcional futuro: `view_item_list` / `select_item`; `payment_type` = card|pse|nequi si Wompi lo entrega.
- Métodos `trackLogin` / `trackSearch` / `trackRegistration` existen pero pueden no estar cableados en todas las pantallas.

---

## 11. Relación con otros markdown

| Archivo | Rol |
|---|---|
| **`docs/tracking-ga4-meta.md`** (este) | Fuente de verdad del funnel actual |
| `GOOGLE_ANALYTICS_EJEMPLOS.md` | Puntero + ejemplos de API actualizados |
| `GOOGLE_ANALYTICS_SETUP.md` | Histórico GTM; ver estado actual en el encabezado |
| `CONFIGURAR_GA4_EN_GTM.md` / `VERIFICAR_GOOGLE_ANALYTICS.md` | Útiles solo si se vuelve a GTM |
