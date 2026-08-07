# Escenario de demostración Eventum — Documento de diseño

**Estado:** borrador para decisión de producto  
**Alcance:** qué debe existir (datos y métricas) para que la demo comercial se sienta viva  
**Fuera de alcance:** implementación, arquitectura, base de datos

---

## 1. Objetivo

Durante una demostración comercial, el organizador debe percibir Eventum como un **producto completo y profesional**: un negocio bajo control, con inteligencia accionable y operación lista para el día del evento.

La pregunta central:

> **¿Qué información necesita existir para que el organizador vea un producto vivo?**

Esto **no** es “crear compras por crear compras”. Es poblar la **narrativa correcta** en cada pantalla: finanzas creíbles, momentum comercial, operación en puerta y configuración coherente.

---

## 2. Las tres capas de una demo viva

| Capa | Qué aporta | Sin ella… |
|------|------------|-----------|
| **Configuración** | Evento, tipos, productos, cupones, fechas, imagen | Pantallas vacías con empty states |
| **Actividad comercial** | Ventas, ingresos, clientes, ranking, ritmo diario | Dashboard e Inteligencia no transmiten valor |
| **Actividad operativa** | Asistentes, boletas usadas, escaneos, timeline | Operaciones y puerta no demuestran cierre |

---

## 3. Inventario por pantalla

### 3.1 Dashboard del organizador

Vista **consolidada** de todos los eventos del organizador.

#### Hero
- Saludo / identidad del usuario
- **Recibirías aproximadamente** (saldo neto estimado consolidado)
- Eventos activos (conteo)
- Próximos eventos (conteo)
- Frase de estado del negocio

#### Necesita tu atención
- Eventos sin publicar → CTA publicar
- Eventos próximos (≤14 días) → CTA abrir operaciones
- Eventos con mejor rendimiento → CTA inteligencia
- Mensaje + tono (warn / ok / info) + acción

#### KPI resumen (4)
- Recibirás aprox.
- Boletas vendidas (total organizador)
- Eventos activos
- Asistencia promedio (%)

#### Detalle secundario
- Boletas por estado (pendiente, usada, cancelada, reembolsada)
- Recaudo bruto mes actual / mes anterior
- Recaudo bruto hoy / ayer + variación %

#### Próximos eventos (agenda)
- Fecha corta + título
- “Hoy / Mañana / En N días”
- Enlace a operaciones

#### Actividad reciente (feed)
- Tiempo relativo (“Hace 5 minutos”)
- Mensaje narrativo (entradas / productos / mixta + evento)
- Monto pagado

#### Ranking rendimiento
- Top eventos por boletas vendidas
- % relativo al líder
- Enlace a inteligencia

**Demo completa requiere:** ≥2 eventos en cartera, ingresos > 0, 5+ ítems en feed, top_eventos con 2–3 filas, boletas_por_estado con mezcla pendiente/usada.

---

### 3.2 Centro de Inteligencia

Vista **por evento** — pantalla estrella de la demo.

#### Hero
- Título, fecha, estado (pill)
- Cuenta regresiva o “En vivo / Finalizado”
- Headline contextual según estado y aforo

#### Strip financiero
- Recibirás aproximadamente
- Contexto: pagaron, descuentos (si hay recaudo)
- Desglose boletas vs productos (si aplica)

#### Pulse (2 KPIs)
- **Aforo vendido** — % + barra + frases
- **Asistentes** — count + tasa de ingreso vs vendidas

#### Acción ahora
- Recomendación principal con CTA (compartir, escáner, boletas, operaciones…)
- Variante según: sin ventas, pocos días + bajo aforo, casi agotado, en curso, finalizado

#### ¿Cómo van mis ventas?
- Clientes pagaron — boletas
- Clientes pagaron — productos
- Descuentos estimados (+ %)
- Recibirás aprox. — boletas / productos
- Conclusión narrativa (mix, descuentos, diversificación)

#### ¿Qué está pasando hoy?
- Entradas vendidas hoy
- Monto pagado hoy
- Comparativa vs ayer (+/- %)
- Mención de productos (si hay catálogo)

#### Ranking boletas
- Por tipo: nombre, vendidas, % del total, ingresos
- Conclusión + CTA opcional (ej. gestionar boletas)

#### Ranking productos (si hay catálogo)
- Por producto: unidades, % ingresos, monto
- Conclusión + CTA catálogo

#### Spotlight “Líder en entradas”
- Tipo #1: % + vendidas + ingresos

#### Oportunidades (hasta 5)
- Insights accionables: cupones, productos, tipos VIP, concentración de ventas, ampliar catálogo
- CTAs secundarios

**Datos subyacentes:** tipos_boleta (cupos y vendidas), reporte evento (boletas_vendidas, boletas_usadas, clientes), stats del evento (finanzas, ingresos día), ventas últimos 7 días, productos con ventas, cupones count.

**Demo completa requiere:** ≥2 tipos con ventas desiguales, aforo 40–85%, ventas en varios días, ≥10 clientes únicos, opcional productos + cupones.

---

### 3.3 Centro de Operaciones

Vista **operativa + configuración** del evento.

#### Hero
- Imagen, título, fecha, lugar
- Pills: estado, en catálogo, destacado
- Hubs Inteligencia / Operaciones

#### Lifecycle + readiness
- Barra borrador → publicado → en curso → finalizado
- Checklist: información, imagen, fechas, boletas, cobros, productos (opc.), publicación
- % readiness + siguiente paso + CTA

#### Pulso del evento (4 KPIs)
- Boletas vendidas
- Ingresos (recaudo bruto del evento)
- Tendencia hoy vs ayer
- Asistentes (de X vendidas)
- Cupones usados (+ cupones activos)

#### Barra de acciones
- Boletas (badge: N tipos)
- Productos (badge: N productos)
- Escanear
- Ventas (badge: N ventas) — valor referencial en producto completo
- Cupones

#### Timeline
- Hitos: creado, publicado, primera venta, inicio/fin venta, en curso, finalizado

#### Drawers (configuración visible en demo madura)
- Información, imagen, fechas, boletas, cobros, productos, cupones

**Demo completa requiere:** readiness 100% o casi, pulso con números > 0, timeline con ≥2 hitos, badges en barra.

---

### 3.4 Reportes

*Referencia de valor completo; hoy no accesible al organizador showcase.*

#### General
- KPI panel (ingresos, margen neto, boletas, productos, eventos, clientes)
- Ingresos mes / día
- Finanzas desglose (Wompi, servicio, neto)
- Boletas por estado
- Top 5 eventos

#### Ventas
- Ventas por día (fecha, ingresos, # transacciones)
- Ventas por mes
- Ingresos por evento + ticket promedio
- Distribución método de pago
- Distribución tipo de boleta

#### Asistencia
- Por evento: vendidas, usadas, pendientes, tasa %
- Comparativa visual

#### Comisiones
- Desglose Wompi (bruto, comisión, IVA, neto)
- Por evento

---

### 3.5 Ventas

*Referencia admin; listado operativo de compras.*

- Compras paginadas con transacción, fecha, cliente, evento, total, estado
- Filtros por evento / estado pago
- Detalle de compra y boletas emitidas
- Flujo venta manual (referencia)

**Demo completa:** ≥10 filas visibles, mezcla de tipos y fechas recientes.

---

### 3.6 Boletas (`/boletas`, `/boletas-usadas`)

- Listado boletas pendientes: QR, tipo, evento, asistente, filtros
- Inventario por tipo de boleta
- Boletas usadas: historial de validaciones con fecha
- Coherencia con asistentes en Inteligencia / Operaciones

**Demo completa:** decenas de pendientes; si hay puerta, decenas de usadas.

---

### 3.7 Productos

- Catálogo por evento: nombre, precios, stock total/disponible/vendido
- Estado activo, badge licor
- Al menos un producto con ventas > 0 para Inteligencia

**Demo completa:** 3–5 productos, 1–2 con ventas.

---

### 3.8 Palcos

- Palcos por tipo: disponible / reservado / vendido
- Ventas individuales 1 persona
- Coherente solo si el evento demo incluye tipos `es_palco`

**Opcional** en demo estándar.

---

### 3.9 Cupones (drawer Operaciones)

- Resumen: total cupones, usos agregados
- Por cupón: código, % descuento, activo/inactivo
- usos_actuales / max_usos + barra de progreso
- ≥1 cupón con usos > 0 para pulso “Cupones usados”

---

### 3.10 Escáner (cierre narrativo)

- Boleta válida escaneable
- Validación → actualiza asistentes
- Feedback: asistente, tipo boleta

---

## 4. Configuración base del evento estrella

Independiente del escenario:

| Elemento | Recomendación demo premium |
|----------|----------------------------|
| Identidad | Título comercial, imagen, descripción |
| Lugar | Ciudad reconocible |
| Fechas | Venta abierta; evento en 2–4 semanas |
| Tipos boleta | General + VIP (+ Palco opcional) |
| Aforo | 200–500 entradas |
| Precios | General ~$80–120k, VIP ~$200k+ COP |
| Productos | 3–5 ítems |
| Cupones | 1 lanzamiento + 1 con uso parcial |
| Clientes distintos | ≥15 en ventas |
| Distribución temporal | Ventas en 5–14 días, pico reciente |

**Segundo evento** en borrador alimenta contraste en Dashboard (“Necesita tu atención”).

---

## 5. Escenarios de demostración

Plantillas narrativas. Valores orientativos; deben ser **configurables** antes de aplicar.

---

### Escenario 1 — Evento recién creado

**Historia:** acabo de armar el evento; aún no vendo.

| Pantalla | Qué se ve | Qué no se ve |
|----------|-----------|--------------|
| Dashboard | $0 recibirás, atención al borrador, pocos eventos activos | Feed activo, ranking lleno |
| Inteligencia | Countdown, aforo 0%, “configura entradas”, acción publicar/compartir | Rankings, finanzas, “Hoy vendiste…” |
| Operaciones | Readiness 60–85%, pulso vacío, pasos pendientes | Ingresos, “primera venta” en timeline |
| Productos/Cupones | Catálogo vacío o recién creado | Stock consumido |
| Boletas | Vacío o solo inventario teórico | Validaciones |

**Métricas clave:** 0 ventas, 0 ingresos, aforo configurado 0% vendido, oportunidades de configuración activas.

---

### Escenario 2 — Primeras ventas

**Historia:** publiqué hace pocos días; llegaron las primeras compras.

**Estado:** publicado, 3–15 días al evento, **5–12% aforo**.

| Métrica / dato | Rango orientativo |
|----------------|-------------------|
| Boletas vendidas (evento) | 15–40 |
| Ingresos acumulados | Bajo pero > 0 |
| Clientes únicos | 5–10 |
| Feed reciente | 2–4 ítems < 24 h |
| Ranking boletas | 1–2 tipos con ventas |
| Inteligencia “Hoy” | 0–3 entradas opcional |
| Timeline | creado + publicado + primera venta |
| Oportunidades | cupones, ampliar tipos |

---

### Escenario 3 — Buen ritmo (preventa sólida)

**Historia:** la preventa va bien; hay tracción constante.

**Estado:** publicado, 7–21 días al evento, **35–55% aforo**.

| Métrica / dato | Rango orientativo |
|----------------|-------------------|
| Boletas vendidas | 35–55% del aforo |
| Ingresos mes actual | > mes anterior |
| Ventas por día (7d) | Curva con variación, no plana |
| Hoy vs ayer | +10–30% |
| Ranking | General + VIP con reparto |
| Cupones | 1 cupón con algunos usos |
| Productos | Configurados; ventas bajas o cero |
| Dashboard | Feed activo, 2 eventos en ranking si hay cartera |

---

### Escenario 4 — Casi agotado

**Historia:** queda poco cupo; hay urgencia comercial.

**Estado:** 3–10 días al evento, **82–95% aforo**.

| Métrica / dato | Rango orientativo |
|----------------|-------------------|
| Aforo % | 82–95% |
| Entradas disponibles | Pocas (frase escasez) |
| Acción ahora | Gestionar boletas / liberar cupos |
| Tipo líder | Cerca de agotar su cupo |
| Ingresos | Altos acumulados |
| Oportunidades | “Evalúa liberar más cupos” |

---

### Escenario 5 — Evento exitoso (sold out pre-evento)

**Historia:** vendí todo antes del día D.

**Estado:** 1–5 días al evento, **100% aforo**.

| Métrica / dato | Rango orientativo |
|----------------|-------------------|
| Aforo | 100%, 0 disponibles |
| Finanzas | Recibirás aprox. maximizado |
| Boletas por estado | Casi todo pendiente (aún no puerta) |
| Inteligencia | “Completaste tu aforo” |
| Operaciones | Pulso completo, readiness 100% |

*Variante “día del evento” (en curso):* estado en_curso, asistentes 30–70% de vendidas, acción escáner, ventas/productos hoy altos.

---

### Escenario 6 — Evento finalizado

**Historia:** terminó bien; quiero ver el cierre.

**Estado:** finalizado, post-evento.

| Métrica / dato | Rango orientativo |
|----------------|-------------------|
| Asistencia | 85–95% de vendidas |
| Boletas usadas | Mayoría del total |
| Inteligencia | “Ya finalizó”, finanzas cerradas |
| Hoy | Sin ventas nuevas |
| Timeline | Todos los hitos alcanzados |
| Dashboard | Asistencia promedio alta |

---

### Escenario 7 — Personalizado (opcional)

Parámetros ajustables antes de la demo:

| Parámetro | Efecto |
|-----------|--------|
| % aforo vendido | Inteligencia, pulso, rankings |
| Días al evento / estado lifecycle | Hero, countdown, acción ahora |
| Ventas hoy vs ayer | Bloque “Hoy”, tendencia ops |
| % asistencia | Pulse asistentes, boletas usadas |
| Mix General/VIP | Ranking boletas |
| Productos vendidos | Sección productos, finanzas mixtas |
| Cupones usados | Pulso cupones, descuentos |
| Nº eventos en cartera | Dashboard consolidado |
| Segundo evento borrador | Necesita tu atención |

---

## 6. Demo perfecta recomendada (5 minutos)

### Cartera
- **Evento A (estrella):** Escenario 3 o 4 — ~70% aforo, 7–14 días al evento
- **Evento B:** Escenario 1 — borrador, sin ventas

### Evento A — números orientativos

| Dimensión | Valor |
|-----------|-------|
| Aforo | 300 |
| Vendidas | ~210 (70%) |
| General / VIP | 150 / 60 |
| Ingresos brutos | ~$18–25 M COP |
| Recibirás aprox. | ~$16–22 M |
| Clientes únicos | ~140 |
| Hoy | 8–15 entradas; +15–25% vs ayer |
| Productos | 4 configurados, 2 con ventas |
| Cupones | 2 cupones, ~12 usos |
| Asistentes | 0 (pre-evento) o 45+ (si se simula puerta) |

### Recorrido narrativo
1. Dashboard — negocio entero  
2. Inteligencia (A) — inteligencia del evento  
3. Operaciones (A) — configuración y pulso  
4. Productos / Boletas — profundidad (30 s c/u)  
5. Escáner — una validación en vivo (opcional)

---

## 7. Matriz escenario × métricas

| Métrica | E1 Nuevo | E2 Primeras | E3 Ritmo | E4 Casi full | E5 Éxito | E6 Finalizado |
|---------|:--------:|:-----------:|:--------:|:------------:|:--------:|:-------------:|
| Ingresos / recibirás | — | bajo | medio-alto | alto | máximo | cerrado |
| Aforo % | 0 | 5–12 | 35–55 | 82–95 | 100 | 100 |
| Feed ventas recientes | — | pocas | varias | varias | pocas | — |
| Ranking boletas | vacío | 1–2 tipos | 2+ tipos | líder agotándose | completo | histórico |
| Hoy vs ayer | — | opc. | + | + | plano | — |
| Asistentes | — | — | — | — | 0 o 30–70%* | 85–95% |
| Readiness | parcial | alto | 100% | 100% | 100% | 100% |
| Oportunidades | config | cupones/tipos | equilibrio | cupos | cierre | reporte |
| Productos vendidos | — | — | bajo | medio | medio-alto | total |
| Cupones usados | — | 0–2 | 5–15 | 10–20 | total | total |
| 2º evento borrador | ✓ | ✓ | ✓ | opc. | — | — |

\* Si se incluye variante “en curso” dentro de E5.

---

## 8. Criterios de éxito

La demo funciona si el prospecto:

1. **Ve dinero con contexto** — recibirás, pagaron, descuentos  
2. **Siente momentum** — feed, hoy, tendencias, ranking  
3. **Entiende qué hacer** — publicar, compartir, escanear, ampliar cupos  
4. **Confía en la operación** — readiness, catálogo, puerta coherentes  
5. **No encuentra vacíos incómodos** en la demo principal (escenarios 3–4)

---

## 9. Próximo paso (fuera de este documento)

Decidir la forma más simple de **hacer existir** estos datos en las pantallas que ya consumen `DashboardStats`, `ReporteEvento` y catálogos — sin definir aún cómo.
