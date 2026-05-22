# Módulo productos — notas de integración

## 1. Ejecutar migración

Aplicar `001_modulo_productos.sql` en Supabase (SQL Editor o CLI).

## 2. Edge Functions

Desplegar desde `supabase/functions/`:

- `wompi-payment` — crea el payment link
- `wompi-webhook` — confirma boletas y/o productos

### Request `wompi-payment`

**Solo boletas** (compatibilidad actual):

```json
{
  "compra_id": 123,
  "amount_in_cents": 5000000,
  "redirect_url": "https://.../pago-resultado?compra_id=123",
  "customer_email": "cliente@email.com"
}
```

**Solo productos:**

```json
{
  "tipo": "productos",
  "compra_producto_id": 456,
  "amount_in_cents": 2000000,
  "redirect_url": "https://.../pago-resultado?compra_producto_id=456",
  "customer_email": "cliente@email.com"
}
```

**Mixto (boletas + productos, un solo cobro):**

```json
{
  "tipo": "mixto",
  "compra_id": 123,
  "compra_producto_id": 456,
  "amount_in_cents": 7000000,
  "redirect_url": "https://.../pago-resultado?compra_id=123&compra_producto_id=456",
  "customer_email": "cliente@email.com"
}
```

### Referencias Wompi

| Tipo | Formato |
|------|---------|
| Boletas | `EVENTUM-{compra_id}-{timestamp}` |
| Productos | `EVENTUM-PROD-{compra_producto_id}-{timestamp}` |
| Mixto | `EVENTUM-MIX-{compra_id}-{compra_producto_id}-{timestamp}` |

### Persistencia

| Tipo | Dónde se guarda `payment_link_id` |
|------|-----------------------------------|
| Boletas | `compras.wompi_transaction_id` |
| Productos | `transacciones_producto.wompi_transaction_id` |
| Mixto | Ambas tablas con el mismo ID |

### Webhook

Al recibir `APPROVED`:

1. **Boletas:** actualiza `compras` (trigger existente activa boletas).
2. **Productos:** llama `confirmar_compra_producto(id)` y actualiza `transacciones_producto`.
3. **Mixto:** ejecuta ambos pasos en la misma notificación.

Al recibir `DECLINED` / `VOIDED`: marca ambas compras como fallidas/canceladas sin confirmar stock.

## 3. Tablas

| Tabla | Rol |
|-------|-----|
| `productos` | Catálogo por `evento_id` |
| `compras_productos` | Cabecera del pedido |
| `compras_productos_items` | Líneas del pedido |
| `transacciones_producto` | ID Wompi y estado del intento de pago |

## 4. Licor

Productos con `es_licor = true` exigen aceptación de términos en checkout (`terminos_licor_aceptados` en `compras_productos`).

## 5. Despliegue

```bash
supabase functions deploy wompi-payment
supabase functions deploy wompi-webhook
```

Variables de entorno requeridas (como antes): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_ENVIRONMENT`, `PUBLIC_APP_URL`.
