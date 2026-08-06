# Reglas del Dashboard Administrador (`/dashboard`)

Auditoría del estado actual del código. **Sin cambios de lógica**: describe exactamente cómo se calcula y muestra cada valor hoy.

---

## Alcance y arquitectura

| Elemento | Valor |
|----------|-------|
| **Ruta** | `/dashboard` |
| **Componente** | `src/app/pages/dashboard/dashboard.ts` |
| **Servicio** | `DashboardService.getStats()` — **sin** `eventoId` (alcance global de la plataforma) |
| **Cache** | SessionStorage, TTL 60 s, clave por `usuarioId` |
| **Subcomponentes visibles** | `app-dashboard-kpis`, `app-ingresos-resumen`, `app-finanzas-desglose` + bloques inline en `dashboard.html` |
| **Utilidad financiera compartida** | `src/app/utils/wompi-finanzas.ts` → `agregarFinanzasDesdeComprasCompletadas`, `repartoWompiPorCompra`, `calcularWompiDescuento` |
| **Filtro de pago universal** | Casi todas las métricas de ventas/ingresos exigen `estado_pago = 'completado'` |
| **Filtro opcional de evento** | `withEventFilter(query)` aplica `.eq(column, eventoId)` **solo si** se pasa `eventoId`. En el dashboard admin **no se pasa**, por lo que no hay filtro por evento. |

### Constantes Wompi (estimación, no extracto oficial)

```
WOMPI_COMISION_TARIFA = 0.0267
WOMPI_COMISION_FIJO_COP = 700
WOMPI_IVA = 0.19
W = (T × 0.0267 + 700) × 1.19
```

Por cada compra con total `T` y valor de servicio `VS`:

```
BV = max(0, T − VS)                    // bruto ventas (parte empresario)
wompi_ventas = round(W × (BV / T))     // si T > 0
wompi_servicio = W − wompi_ventas
neto_ventas_post_wompi = BV − wompi_ventas
neto_servicio_post_wompi = VS − wompi_servicio
neto_total_post_wompi = T − W
ingresos_ventas_bruto = BV
```

Los agregados del dashboard **suman** estos valores fila a fila.

### Datos cargados pero **no renderizados** en el dashboard admin

Estos campos se obtienen en `getStats()` y se guardan en `DashboardStats`, pero **no aparecen** en `dashboard.html`:

- `categorias_activas`
- `lugares_activos`
- `tiene_productos`

Se documentan al final como referencia.

---

## Sección: Resumen ejecutivo (`app-dashboard-kpis`)

---

### KPI: Ingresos totales (hero)

**Qué representa:** Suma de todos los montos cobrados al cliente (`total` de checkout) por boletas y productos, histórico completo, solo pagos completados.

**Fuente de datos:**
- Boletas → tabla `compras`
- Productos → tabla `compras_productos`

**Consulta:**
```sql
-- Boletas (vía Supabase JS)
SELECT total FROM compras WHERE estado_pago = 'completado'

-- Productos
SELECT total FROM compras_productos WHERE estado_pago = 'completado'
```

**Fórmula (UI):**
```
ingresosTotalesGlobales = stats.ingresos_totales + stats.ingresos_productos_totales
```
Implementado en getter `ingresosTotalesGlobales` de `dashboard-kpis.ts`, donde `ingresos_totales` e `ingresos_productos_totales` provienen de `agregarFinanzasDesdeComprasCompletadas(...).ingresos` (suma de `total` por fila).

**Reglas de negocio:**
- Solo `estado_pago = 'completado'`
- Sin filtro de fechas (acumulado histórico)
- Sin filtro de evento en dashboard admin
- Incluye la comisión de servicio Eventum dentro de `total` (es el monto bruto pagado por el comprador)

**Tipo de dinero:** Compartido (checkout total = parte empresario + servicio Eventum)

**¿Debe mostrarse al empresario?** Sí (equivalente en dashboard organizador, posiblemente filtrado por organizador)

**Observaciones:** Se muestra sin símbolo `$` (`formatAmountNoCurrency`). Tooltip HTML: *"Suma de totales cobrados (bruto)"*.

**Cálculos reutilizables:** `agregarFinanzasDesdeComprasCompletadas`, usado también en `dashboard-organizador.service.ts`, `reportes.ts`, `reporte-ventas-completadas.ts`.

---

### KPI: Ingresos totales — desglose Boletas

**Qué representa:** Subtotal histórico cobrado en compras de boletas (tabla `compras`).

**Fuente de datos:** Tabla `compras`, columna `total`.

**Consulta:** Igual que bloque anterior (solo boletas).

**Fórmula:** `stats.ingresos_totales = Σ compras.total` (completadas).

**Reglas de negocio:** Mismas que ingresos totales hero, solo rama boletas.

**Tipo de dinero:** Compartido (T incluye VS)

**¿Debe mostrarse al empresario?** Sí

**Observaciones:** Es la mitad del split bajo el hero.

---

### KPI: Ingresos totales — desglose Productos

**Qué representa:** Subtotal histórico cobrado en compras de productos.

**Fuente de datos:** Tabla `compras_productos`, columna `total`.

**Consulta:**
```sql
SELECT total FROM compras_productos WHERE estado_pago = 'completado'
```

**Fórmula:** `stats.ingresos_productos_totales = Σ compras_productos.total`

**Reglas de negocio:** Solo pagos completados, histórico completo.

**Tipo de dinero:** Compartido

**¿Debe mostrarse al empresario?** Sí (si tiene productos)

**Observaciones:** Oculto si `mostrarProductos = false` (en admin siempre `true` por defecto).

---

### KPI: Variación % vs mes anterior (bajo ingresos totales)

**Qué representa:** Cambio porcentual de ingresos de **boletas** del mes calendario actual vs el mes calendario anterior.

**Fuente de datos:** Tabla `compras`, columna `total`, filtrada por `fecha_compra`.

**Consulta:**
```sql
-- Mes actual: fecha_compra >= inicio del mes (Date local del navegador, 00:00:00)
-- Mes anterior: fecha_compra entre inicio y fin del mes anterior
SELECT total FROM compras
WHERE estado_pago = 'completado'
  AND fecha_compra BETWEEN ...
```

**Fórmula (UI):**
```
variacion = anterior === 0
  ? (actual > 0 ? 100 : 0)
  : round(((actual - anterior) / anterior) × 100)
```
Usa `stats.ingresos_mes_actual` y `stats.ingresos_mes_anterior`.

**Reglas de negocio:**
- **Solo compras de boletas** (`compras`); **no incluye productos**
- Límites de mes calculados con `new Date()` en zona local del navegador (no `America/Bogota` explícito)
- Solo se muestra si `stats.ingresos_mes_anterior` es truthy (≠ 0)

**Tipo de dinero:** Compartido (total checkout boletas)

**¿Debe mostrarse al empresario?** Parcial (misma fórmula en organizador; el empresario puede malinterpretar si espera incluir productos)

**Observaciones:** Etiqueta UI dice explícitamente *"vs mes anterior (boletas)"*.

**Cálculos reutilizables:** `getVariacionPorcentual` en `dashboard-kpis.ts`, `ingresos-resumen.ts`, `dashboard.ts`.

---

### KPI: Margen neto total

**Qué representa:** Dinero neto estimado después de descontar comisión Wompi sobre **todas** las transacciones completadas (boletas + productos), sumando el neto total por compra (`T − W`).

**Fuente de datos:** Derivado de `compras` y `compras_productos` vía `agregarFinanzasDesdeComprasCompletadas`.

**Consulta:** Mismas consultas de ingresos (`total`, `valor_servicio`, `porcentaje_servicio`).

**Fórmula (servicio):**
```
neto_total_post_wompi_total = ingresos_totales − wompi_total_estimado   // boletas
neto_productos_total_post_wompi_total = ingresos_productos − wompi_productos_total_estimado
```

**Fórmula (UI):**
```
netoTotalConsolidado = neto_total_post_wompi_total + neto_productos_total_post_wompi_total
```

**Reglas de negocio:**
- Wompi es **estimación** (`wompi-finanzas.ts`), no conciliación con extracto Wompi
- Incluye neto del empresario **y** neto del servicio Eventum en un solo número (es el remanente total post-Wompi)

**Tipo de dinero:** Compartido

**¿Debe mostrarse al empresario?** Parcial (útil como referencia; mezcla ambas partes — el empresario suele mirar solo su neto de ventas)

**Observaciones:** Etiqueta UI: *"Margen neto total"*.

---

### KPI: Neto servicio total

**Qué representa:** Comisión de servicio Eventum neta después de la porción proporcional de Wompi atribuida al servicio.

**Fuente de datos:** `compras` + `compras_productos`, columnas `total`, `valor_servicio`.

**Consulta:** Mismas consultas financieras.

**Fórmula (servicio):** Por fila: `neto_servicio_post_wompi = VS − wompi_servicio`; agregado: suma de filas.

**Fórmula (UI):**
```
netoServicioTotalConsolidado =
  neto_servicio_post_wompi_total
  + neto_productos_servicio_post_wompi_total
```

**Reglas de negocio:** Solo pagos completados; reparto Wompi proporcional a `BV/T`.

**Tipo de dinero:** Eventum

**¿Debe mostrarse al empresario?** Parcial (visible en desglose financiero del organizador; es ingreso de la plataforma, no del empresario)

**Observaciones:** KPI exclusivo de salud de Eventum en el panel superior.

---

### KPI: Boletas vendidas

**Qué representa:** Cantidad de registros en `boletas_compradas` cuya compra padre tiene pago completado.

**Fuente de datos:** Tablas `boletas_compradas` + join `compras`.

**Consulta:**
```sql
SELECT count(*)
FROM boletas_compradas
INNER JOIN compras ON ...
WHERE compras.estado_pago = 'completado'
```

**Fórmula:** `count` exacto de filas (cada boleta comprada = 1 unidad, no agrupa por tipo).

**Reglas de negocio:** Una fila por boleto emitido; no filtra por `boletas_compradas.estado` (pendiente/usada/cancelada).

**Tipo de dinero:** N/A (unidades)

**¿Debe mostrarse al empresario?** Sí

**Observaciones:** Meta inferior: *"Total boletas"*.

---

### KPI: Productos vendidos

**Qué representa:** Suma de unidades (`cantidad`) vendidas en ítems de productos con pago completado.

**Fuente de datos:** Tablas `compras_productos_items` + join `compras_productos`.

**Consulta:**
```sql
SELECT cantidad, compras_productos.estado_pago
FROM compras_productos_items
INNER JOIN compras_productos ON ...
WHERE compras_productos.estado_pago = 'completado'
```

**Fórmula:** `Σ item.cantidad`

**Reglas de negocio:** Solo pedidos completados.

**Tipo de dinero:** N/A (unidades)

**¿Debe mostrarse al empresario?** Sí

**Observaciones:** Meta muestra pedidos completados (`pedidos_productos`).

---

### KPI: Pedidos de productos (meta de Productos vendidos)

**Qué representa:** Cantidad de pedidos (`compras_productos`) completados.

**Fuente de datos:** Tabla `compras_productos`.

**Consulta:**
```sql
SELECT count(*) FROM compras_productos WHERE estado_pago = 'completado'
```

**Fórmula:** `count` head exact.

**Reglas de negocio:** Solo completados.

**Tipo de dinero:** N/A

**¿Debe mostrarse al empresario?** Sí

**Observaciones:** Solo texto secundario bajo productos vendidos.

---

### KPI: Eventos activos

**Qué representa:** Eventos publicados, activos y aún vigentes (sin fecha de fin o con `fecha_fin >= ahora`).

**Fuente de datos:** Tabla `eventos`.

**Consulta:** Dos conteos sumados:
```sql
-- A: activo=true, estado='publicado', fecha_fin IS NULL
-- B: activo=true, estado='publicado', fecha_fin >= now
eventos_activos = count(A) + count(B)
```
`now = timezoneService.getCurrentDateISO()` → `DateTimeUtil.nowISO()`.

**Fórmula:** Suma de ambos conteos.

**Reglas de negocio:**
- Debe estar `activo = true` y `estado = 'publicado'`
- Vigencia: sin `fecha_fin` **o** `fecha_fin` futura

**Tipo de dinero:** N/A

**¿Debe mostrarse al empresario?** Sí (en su dashboard, filtrado por `organizador_id`)

**Observaciones:** Label por defecto *"Eventos Activos"*. Meta: `eventos_totales`.

---

### KPI: Eventos totales (meta)

**Qué representa:** Conteo total de filas en `eventos` (todos los estados).

**Fuente de datos:** Tabla `eventos`.

**Consulta:** `SELECT count(*) FROM eventos`

**Fórmula:** `count` exact.

**Reglas de negocio:** Sin filtros en dashboard admin.

**Tipo de dinero:** N/A

**¿Debe mostrarse al empresario?** Sí

**Observaciones:** Texto secundario *"X totales"*.

---

### KPI: Clientes

**Qué representa:** Clientes únicos que han completado al menos una compra de boletas.

**Fuente de datos:** Tabla `compras`, columna `cliente_id`.

**Consulta:**
```sql
SELECT cliente_id FROM compras WHERE estado_pago = 'completado'
```

**Fórmula:** `new Set(cliente_id).size`

**Reglas de negocio:**
- Solo compras de boletas completadas
- **No incluye** clientes que solo compraron productos (`compras_productos`)

**Tipo de dinero:** N/A

**¿Debe mostrarse al empresario?** Sí

**Observaciones:** Puede subcontar clientes solo-producto.

---

## Sección: Ingresos por mes y por día (`app-ingresos-resumen`)

---

### KPI: Ingresos mes actual

**Qué representa:** Suma de `total` de compras de boletas completadas desde el día 1 del mes calendario actual (00:00 hora local del navegador).

**Fuente de datos:** Tabla `compras`.

**Consulta:**
```sql
SELECT total FROM compras
WHERE estado_pago = 'completado'
  AND fecha_compra >= inicioMes.toISOString()
```

**Fórmula:** `Σ total`

**Reglas de negocio:**
- **Solo boletas** (`compras`)
- Inicio de mes: `new Date(); setDate(1); setHours(0,0,0,0)` — zona local del navegador

**Tipo de dinero:** Compartido (T checkout)

**¿Debe mostrarse al empresario?** Sí

**Observaciones:** No incluye productos del mes.

---

### KPI: Ingresos mes anterior

**Qué representa:** Igual que mes actual, para el mes calendario anterior completo.

**Fuente de datos:** Tabla `compras`.

**Consulta:**
```sql
fecha_compra >= inicioMesAnterior AND fecha_compra <= finMesAnterior
```
`finMesAnterior` = último día del mes previo 23:59:59.999 (local).

**Fórmula:** `Σ total`

**Reglas de negocio:** Solo boletas completadas.

**Tipo de dinero:** Compartido

**¿Debe mostrarse al empresario?** Sí

**Observaciones:** Usado también en variación del hero KPI.

---

### KPI: Ingresos hoy

**Qué representa:** Suma de `total` de compras de boletas completadas en el día calendario actual.

**Fuente de datos:** Tabla `compras`.

**Consulta:**
```sql
fecha_compra >= DateTimeUtil.dayStartDaysAgo(0)
AND fecha_compra <= DateTimeUtil.dayEndDaysAgo(0)
```

**Fórmula:** `Σ total`

**Reglas de negocio:**
- Solo boletas
- Ventana de día: medianoche–23:59:59.999 **hora local del navegador** convertida a ISO UTC

**Tipo de dinero:** Compartido

**¿Debe mostrarse al empresario?** Sí

**Observaciones:** Inconsistente con meses (meses usan `new Date()` directo; días usan `DateTimeUtil`).

---

### KPI: Variación % hoy vs ayer

**Qué representa:** Cambio porcentual entre ingresos de boletas de hoy y ayer.

**Fuente de datos:** `ingresos_dia_actual`, `ingresos_dia_anterior`.

**Fórmula:** Misma `getVariacionPorcentual(actual, anterior)`.

**Reglas de negocio:** Solo boletas; solo se renderiza si `ingresos_dia_anterior` no es null/undefined.

**Tipo de dinero:** Compartido

**¿Debe mostrarse al empresario?** Sí

**Observaciones:** Cálculo puramente en UI (`ingresos-resumen.ts`).

---

### KPI: Ingresos ayer

**Qué representa:** Suma de boletas completadas en el día calendario anterior.

**Fuente de datos:** Tabla `compras`.

**Consulta:** `dayStartDaysAgo(1)` … `dayEndDaysAgo(1)`.

**Fórmula:** `Σ total`

**Reglas de negocio:** Solo boletas completadas.

**Tipo de dinero:** Compartido

**¿Debe mostrarse al empresario?** Sí

---

## Sección: Salud financiera (`app-finanzas-desglose`)

El componente permite filtrar vista: **Boletas | Productos | Todo** (`viewMode`). Los totales inferiores respetan ese filtro.

---

### KPI: Bruto boletas

**Qué representa:** Parte del checkout atribuida al empresario (venta de boletas sin comisión de servicio Eventum).

**Fuente de datos:** Tabla `compras` — columnas `total`, `valor_servicio`.

**Consulta:**
```sql
SELECT total, valor_servicio, porcentaje_servicio
FROM compras WHERE estado_pago = 'completado'
```

**Fórmula:** `ingresos_ventas_bruto_total = Σ max(0, total − valor_servicio)`

**Reglas de negocio:** Pagos completados; histórico completo.

**Tipo de dinero:** Empresario

**¿Debe mostrarse al empresario?** Sí

**Observaciones:** Bloque *"Valor cliente (empresario)"*.

---

### KPI: Wompi boletas

**Qué representa:** Porción estimada de comisión Wompi asignada al rubro ventas/boletas.

**Fuente de datos:** Derivado de `compras.total` y `compras.valor_servicio`.

**Fórmula:** `wompi_ventas_total = Σ round(W × (BV/T))` por compra.

**Reglas de negocio:** Estimación; reparto proporcional a BV/T.

**Tipo de dinero:** Compartido (costo de pasarela sobre parte empresario)

**¿Debe mostrarse al empresario?** Parcial (transparencia de costos; en organizador también visible)

**Observaciones:** No es el cargo Wompi real conciliado.

---

### KPI: Neto boletas (ventas)

**Qué representa:** Lo que queda al empresario por venta de boletas después de Wompi estimado.

**Fuente de datos:** Derivado de `compras`.

**Fórmula:** `neto_ventas_post_wompi_total = Σ (BV − wompi_ventas)`

**Reglas de negocio:** Estimado post-Wompi.

**Tipo de dinero:** Empresario

**¿Debe mostrarse al empresario?** Sí

---

### KPI: Bruto productos

**Qué representa:** Parte empresario en compras de productos (sin servicio Eventum).

**Fuente de datos:** Tabla `compras_productos`.

**Consulta:**
```sql
SELECT total, valor_servicio, porcentaje_servicio
FROM compras_productos WHERE estado_pago = 'completado'
```

**Fórmula:** `ingresos_productos_bruto_total = Σ max(0, total − valor_servicio)`

**Reglas de negocio:** Pagos completados.

**Tipo de dinero:** Empresario

**¿Debe mostrarse al empresario?** Sí

---

### KPI: Wompi productos

**Qué representa:** Porción Wompi estimada sobre ventas de productos.

**Fuente de datos:** `compras_productos`.

**Fórmula:** `wompi_productos_ventas_total = Σ wompi_ventas` (misma función por fila).

**Reglas de negocio:** Estimación proporcional.

**Tipo de dinero:** Compartido (costo pasarela)

**¿Debe mostrarse al empresario?** Parcial

---

### KPI: Neto productos (ventas)

**Qué representa:** Neto empresario en productos post-Wompi estimado.

**Fuente de datos:** `compras_productos`.

**Fórmula:** `neto_productos_ventas_post_wompi_total = Σ neto_ventas_post_wompi`

**Reglas de negocio:** Estimado.

**Tipo de dinero:** Empresario

**¿Debe mostrarse al empresario?** Sí

---

### KPI: Servicio bruto boletas

**Qué representa:** Comisión de servicio Eventum cobrada al cliente en compras de boletas.

**Fuente de datos:** Tabla `compras`, columna `valor_servicio`.

**Fórmula:** `valor_servicio_total = Σ valor_servicio`

**Reglas de negocio:** Solo completadas.

**Tipo de dinero:** Eventum

**¿Debe mostrarse al empresario?** Parcial (visible en desglose; es ingreso de plataforma)

---

### KPI: Wompi servicio boletas

**Qué representa:** Porción Wompi estimada cargada al rubro servicio Eventum (boletas).

**Fuente de datos:** Derivado de `compras`.

**Fórmula:** `wompi_servicio_total = Σ (W − wompi_ventas)`

**Reglas de negocio:** Resto del W total por fila.

**Tipo de dinero:** Eventum (costo pasarela sobre comisión)

**¿Debe mostrarse al empresario?** No (dato interno Eventum; aunque hoy se muestra en el mismo componente al organizador)

---

### KPI: Neto servicio boletas

**Qué representa:** Ingreso neto Eventum por comisión de servicio en boletas.

**Fuente de datos:** Derivado de `compras`.

**Fórmula:** `neto_servicio_post_wompi_total = Σ (VS − wompi_servicio)`

**Reglas de negocio:** Estimado.

**Tipo de dinero:** Eventum

**¿Debe mostrarse al empresario?** No

---

### KPI: Promedio % servicio boletas

**Qué representa:** Promedio aritmético simple de `porcentaje_servicio` por compra completada.

**Fuente de datos:** Tabla `compras`, columna `porcentaje_servicio`.

**Fórmula:** `porcentaje_servicio_promedio = Σ porcentaje_servicio / count(filas)`

**Reglas de negocio:** **No ponderado** por monto; cada compra pesa igual.

**Tipo de dinero:** N/A (tasa)

**¿Debe mostrarse al empresario?** Parcial

**Observaciones:** Mostrado como texto informativo en cabecera del bloque Eventum.

---

### KPI: Servicio bruto productos

**Qué representa:** Comisión Eventum en compras de productos.

**Fuente de datos:** `compras_productos.valor_servicio`.

**Fórmula:** `valor_servicio_productos_total = Σ valor_servicio`

**Reglas de negocio:** Completadas.

**Tipo de dinero:** Eventum

**¿Debe mostrarse al empresario?** Parcial

---

### KPI: Wompi servicio productos

**Qué representa:** Wompi estimado sobre comisión de productos.

**Fuente de datos:** `compras_productos`.

**Fórmula:** `wompi_productos_servicio_total = Σ wompi_servicio`

**Tipo de dinero:** Eventum

**¿Debe mostrarse al empresario?** No

---

### KPI: Neto servicio productos

**Qué representa:** Neto Eventum por servicio en productos.

**Fuente de datos:** `compras_productos`.

**Fórmula:** `neto_productos_servicio_post_wompi_total = Σ neto_servicio_post_wompi`

**Tipo de dinero:** Eventum

**¿Debe mostrarse al empresario?** No

---

### KPI: Promedio % servicio productos

**Qué representa:** Promedio simple de `porcentaje_servicio` en `compras_productos`.

**Fórmula:** `porcentaje_servicio_productos_promedio = Σ porcentaje_servicio / n`

**Reglas de negocio:** No ponderado.

**Tipo de dinero:** N/A

**¿Debe mostrarse al empresario?** Parcial

---

### KPI: Wompi total (pie de desglose)

**Qué representa:** Comisión Wompi estimada total según filtro de vista activo.

**Fuente de datos:** Campos agregados del servicio.

**Fórmula (UI — getter `wompiTotalVisible`):**
```
viewMode = boletas  → wompi_total_estimado
viewMode = productos → wompi_productos_total_estimado
viewMode = todo     → wompi_total_estimado + wompi_productos_total_estimado
```

**Reglas de negocio:** Estimación; respeta tabs Boletas/Productos/Todo.

**Tipo de dinero:** Compartido (costo pasarela total)

**¿Debe mostrarse al empresario?** Parcial

---

### KPI: Neto total (pie de desglose)

**Qué representa:** Remanente total post-Wompi (`T − W`) según filtro de vista.

**Fuente de datos:** Campos agregados.

**Fórmula (UI — getter `netoTotalVisible`):**
```
viewMode = boletas  → neto_total_post_wompi_total
viewMode = productos → neto_productos_total_post_wompi_total
viewMode = todo     → suma de ambos
```
Donde en servicio:
```
neto_total_post_wompi_total = ingresos_totales − wompi_total_estimado
neto_productos_total_post_wompi_total = ingresos_productos_totales − wompi_productos_total_estimado
```

**Reglas de negocio:** Incluye neto empresario + neto Eventum en un solo total.

**Tipo de dinero:** Compartido

**¿Debe mostrarse al empresario?** Parcial

---

## Sección: Operación en tiempo real

---

### KPI / Lista: Ventas recientes (máx. 5)

**Qué representa:** Últimas transacciones completadas, mezclando boletas y productos, con fusión de compras relacionadas.

**Fuente de datos:** Tablas `compras` y `compras_productos` + join `eventos`.

**Consulta:**
```sql
-- Boletas: últimas 20 completadas
SELECT id, cliente_id, evento_id, numero_transaccion, total, estado_pago, fecha_compra, evento(...)
FROM compras WHERE estado_pago = 'completado' ORDER BY fecha_compra DESC LIMIT 20

-- Productos: últimas 20 completadas (numero_pedido)
SELECT ... FROM compras_productos ... LIMIT 20
```

**Fórmula (post-proceso en servicio):**
1. Normaliza ambas fuentes a filas comunes.
2. Ordena por `fecha_compra` desc.
3. **Fusiona** filas si mismo `evento_id` y:
   - mismo `cliente_id` y diferencia de tiempo ≤ 2 minutos, **o**
   - mismo "seed" numérico en número de transacción/pedido (≥10 dígitos) con diferencia ≤ 2 minutos.
4. Compra mixta: suma `total`, `tipo_venta = 'mixta'`, usa `numero_transaccion` de la compra de boletas.
5. Toma **5** finales.

**Reglas de negocio:** Solo completadas; fusión heurística checkout mixto boletas+productos.

**Tipo de dinero:** Compartido (muestra `total` checkout)

**¿Debe mostrarse al empresario?** Sí (lista equivalente en organizador)

**Observaciones:** Campos mostrados: `numero_transaccion`, `fecha_compra`, `evento.titulo`, `total`, `tipo_venta`, `estado_pago`.

---

### KPI / Lista: Eventos próximos (máx. 5)

**Qué representa:** Próximos eventos por fecha de inicio.

**Fuente de datos:** Tabla `eventos`.

**Consulta:**
```sql
SELECT * FROM eventos
WHERE activo = true
  AND fecha_inicio >= now
ORDER BY fecha_inicio ASC
LIMIT 5
```

**Fórmula:** Listado directo (sin agregación).

**Reglas de negocio:**
- `activo = true`
- **No exige** `estado = 'publicado'` (a diferencia de eventos activos)
- `fecha_inicio >= now`

**Tipo de dinero:** N/A

**¿Debe mostrarse al empresario?** Sí

**Observaciones:** Muestra imagen, título, fecha, descripción corta.

---

## Sección: Comportamiento de audiencia

---

### KPI / Gráfico: Boletas por estado

**Qué representa:** Distribución de boletas emitidas (con compra completada) según su campo `estado`.

**Fuente de datos:** Tablas `boletas_compradas` + join `compras`.

**Consulta:**
```sql
SELECT estado FROM boletas_compradas
INNER JOIN compras ON ... WHERE compras.estado_pago = 'completado'
```

**Fórmula (servicio):** Agrupa en memoria: `count por boletas_compradas.estado` (default `'pendiente'` si null).

**Fórmula (UI — barra):**
```
anchoBarra = (item.cantidad / stats.boletas_vendidas) × 100
```

**Reglas de negocio:**
- Solo boletas cuya compra está completada
- Denominador = total boletas vendidas KPI (mismo universo)
- Estados típicos: pendiente, usada, cancelada, reembolsada

**Tipo de dinero:** N/A

**¿Debe mostrarse al empresario?** Sí

**Observaciones:** No es gráfico de ingresos; es conteo operativo.

---

### KPI / Lista: Eventos más populares (top 5)

**Qué representa:** Eventos con más boletas vendidas (compras completadas).

**Fuente de datos:** `boletas_compradas` → `tipos_boleta.evento_id` → `eventos`.

**Consulta:**
```sql
SELECT tipo_boleta_id, tipos_boleta.evento_id
FROM boletas_compradas
INNER JOIN tipos_boleta ON ...
INNER JOIN compras ON ... WHERE compras.estado_pago = 'completado'
```
Luego cuenta por `evento_id`, top 5 IDs, fetch `eventos(id, titulo, imagen_principal)`.

**Fórmula:** `boletas_vendidas por evento = count(filas)`; orden desc; slice 5.

**Reglas de negocio:** Solo pagos completados; ranking solo por boletas (no ingresos ni productos).

**Tipo de dinero:** N/A

**¿Debe mostrarse al empresario?** Sí

**Observaciones:** Muestra ranking `#1…#5`, imagen, título, conteo de boletas.

---

## Datos cargados pero no mostrados (referencia)

### KPI: Categorías activas

**Qué representa:** Conteo de categorías de evento activas en la plataforma.

**Fuente de datos:** Tabla `categorias_evento`.

**Consulta:** `SELECT count(*) FROM categorias_evento WHERE activo = true`

**Fórmula:** `count` exact.

**Reglas de negocio:** Global; no filtrado por evento.

**Tipo de dinero:** N/A

**¿Debe mostrarse al empresario?** No (no se muestra en UI admin actual)

**Observaciones:** Disponible en `DashboardStats` por si otro consumidor lo usa.

---

### KPI: Lugares activos

**Qué representa:** Conteo de lugares activos.

**Fuente de datos:** Tabla `lugares`.

**Consulta:** `SELECT count(*) FROM lugares WHERE activo = true`

**Fórmula:** `count` exact.

**Reglas de negocio:** Global.

**Tipo de dinero:** N/A

**¿Debe mostrarse al empresario?** No (no renderizado)

---

### KPI: Tiene productos

**Qué representa:** Flag booleano: existe al menos un producto activo en catálogo.

**Fuente de datos:** Tabla `productos`.

**Consulta:** `SELECT count(*) FROM productos WHERE activo = true` → `count > 0`

**Fórmula:** Booleano.

**Reglas de negocio:** Global en admin (sin filtro evento).

**Tipo de dinero:** N/A

**¿Debe mostrarse al empresario?** N/A (flag interno; en organizador sí condiciona UI)

**Observaciones:** En dashboard admin, `app-dashboard-kpis` usa `mostrarProductos = true` por defecto sin leer este flag.

---

## Mapa de dependencias entre fuentes

```
compras (boletas)
  ├── ingresos_totales, valor_servicio, Wompi boletas, netos
  ├── ingresos_mes/día (solo esta tabla)
  ├── clientes únicos
  ├── ventas_recientes (mitad)
  └── join → boletas_compradas → boletas_vendidas, boletas_por_estado, top_eventos

compras_productos
  ├── ingresos_productos_totales, Wompi/neto productos
  └── ventas_recientes (mitad)

compras_productos_items → productos_vendidos (Σ cantidad)

eventos → eventos_activos, eventos_totales, eventos_proximos, top_eventos

categorias_evento → categorias_activas (no UI)

lugares → lugares_activos (no UI)

productos → tiene_productos (no UI admin)
```

---

## Cálculos reutilizables en el codebase

| Utilidad | Ubicación | Usado en |
|----------|-----------|----------|
| `agregarFinanzasDesdeComprasCompletadas` | `wompi-finanzas.ts` | `dashboard.service.ts`, `dashboard-organizador.service.ts` |
| `repartoWompiPorCompra` | `wompi-finanzas.ts` | Reportes, ventas completadas |
| `calcularWompiDescuento` | `wompi-finanzas.ts` | Base del reparto |
| `getVariacionPorcentual` | KPI components + dashboard | Variaciones mes/día |
| `DashboardService.getStats` | `dashboard.service.ts` | Admin dashboard, dashboard-eventos, reportes, inteligencia/operaciones por evento |

---

*Documento generado por auditoría de código. Refleja el comportamiento exacto al momento de la revisión; no implica cambios.*
