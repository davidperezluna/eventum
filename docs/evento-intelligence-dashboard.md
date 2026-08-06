# Centro de Inteligencia del Evento

**Estado:** Diseño — pendiente de aprobación antes de implementar  
**Ruta propuesta:** `/eventos/:id/inteligencia`  
**Restricción:** Solo servicios existentes. Sin cambios en backend, APIs ni Supabase.

---

## Principio rector

> **No estamos construyendo una página de estadísticas.**  
> **Estamos construyendo el Centro de Inteligencia del Evento.**

El empresario debe poder decir:

*"Aquí puedo controlar completamente mi evento y entender mi negocio de un solo vistazo."*

Misma calidad visual y Design System que **Centro de Operaciones** (`--ev-ops-*`, mismos radios, sombras, tipografía, animaciones).

---

## Las 5 preguntas (< 5 segundos)

| # | Pregunta | Protagonista |
|---|----------|--------------|
| 1 | ¿Cuánto dinero llevo? | **Recaudo total** |
| 2 | ¿Qué porcentaje del evento he vendido? | **% aforo vendido** |
| 3 | ¿Cuántas personas han ingresado? | **Asistentes registrados** |
| 4 | ¿Qué está funcionando mejor? | Capa explicativa (rankings, mix) |
| 5 | ¿Qué debo hacer ahora? | Insights + acción primaria |

Los tres primeros son **el pulso del negocio**. Todo lo demás existe para **explicarlos**, no para competir con ellos.

---

## Jerarquía visual (pirámide)

```
                    ┌─────────────────────┐
                    │   HERO (contexto)   │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │    LOS 3 PROTAGONISTAS         │
              │  Recaudo │ Aforo │ Asistentes  │
              └────────────────┬───────────────┘
                               │
                    ┌──────────▼──────────┐
                    │  ¿Qué hacer ahora?  │  ← ev-notice + CTA
                    └──────────┬──────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │         CAPA EXPLICATIVA (scroll)          │
         │  Por recaudo │ Por aforo │ Por asistencia │
         └─────────────────────┬─────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Acciones rápidas   │
                    └─────────────────────┘
```

**Regla de diseño:** si un elemento no ayuda a entender Recaudo, Aforo o Asistentes → no va en fold superior.

---

## Los 3 protagonistas

| # | Indicador | Valor principal | Contexto secundario (1 línea) | Fuente |
|---|-----------|-----------------|-------------------------------|--------|
| 1 | **Recaudo total** | `$12.450.000` | `↑ +12% vs ayer` · entradas + productos | `reporte.ingresos` + `stats.ingresos_productos_totales` |
| 2 | **Aforo vendido** | `78%` | `847 de 1.080 boletas` · barra visual grande | `Σ vendidas / Σ total` tipos |
| 3 | **Asistentes** | `312` | `37% de quienes compraron` · en puerta | `reporte.boletas_usadas` |

### Tratamiento visual

- **Desktop:** 3 cards hero en fila, altura generosa (~160px), tipografía 2× más grande que KPIs secundarios.
- **Mobile:** stack vertical o carrusel con **snap al centro** — los 3 siempre visibles sin scroll horizontal infinito.
- Cada card: icono en contenedor redondeado (como `ev-notice`), valor enorme, label claro, una sola línea de contexto.
- **No** mezclar con ticket promedio, productos uds, etc. en este bloque.

### Métricas secundarias (solo en capa explicativa)

| Métrica | Dónde vive | Por qué |
|---------|------------|---------|
| Boletas vendidas (número) | Subtexto de Aforo | Complementa el % |
| Ingresos hoy / semana | Sección "De dónde viene el recaudo" | Explica Recaudo |
| Ticket promedio | Ranking boletas | Explica mix de precios |
| Productos vendidos | Sección productos | Explica parte del Recaudo |
| Tasa check-in | Subtexto Asistentes | Explica gap vendido vs ingresado |

---

## Wireframe — Desktop (≥1024px)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  ← Mis Eventos     Centro de Inteligencia                         [↻]  [Operaciones] │
├──────────────────────────────────────────────────────────────────────────────────────┤
│  HERO — portada del evento (misma gramática que ev-ops-hero)                         │
│  ┌──────────┐  FESTIVAL ANDINO 2026          ● Publicado   ● En catálogo             │
│  │  IMAGEN  │  12 ago 2026 · Centro Andino, Pasto                                     │
│  └──────────┘  ⏱ Faltan 5 días para el evento                                         │
│                [ Ver evento ]  [ Compartir ]  [ Escáner ]                             │
├──────────────────────────────────────────────────────────────────────────────────────┤
│  EL PULSO DE TU EVENTO                    ← eyebrow, como ev-ops-readiness           │
│                                                                                      │
│  ┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐          │
│  │ 💰 RECAUDO TOTAL    │ │ 📊 AFORO VENDIDO    │ │ 👥 ASISTENTES       │          │
│  │                     │ │                     │ │                     │          │
│  │   $12.450.000       │ │       78%           │ │       312           │          │
│  │                     │ │ ████████████░░░░░░  │ │                     │          │
│  │ ↑ +12% vs ayer      │ │ 847 de 1.080 boletas│ │ 37% ya ingresaron   │          │
│  └─────────────────────┘ └─────────────────────┘ └─────────────────────┘          │
├──────────────────────────────────────────────────────────────────────────────────────┤
│  ¿QUÉ DEBO HACER AHORA?                                                              │
│  ┌─ ev-notice warning ─────────────────────────────────────────────────────────────┐ │
│  │ Te quedan 233 boletas — el evento inicia en 5 días. Refuerza difusión.         │ │
│  └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                          [ Compartir evento ]  ← ev-button primary   │
├──────────────────────────────────────────────────────────────────────────────────────┤
│  ▼ Explicación (scroll natural)                                                      │
│                                                                                      │
│  ── De dónde viene tu recaudo ──────────────────────────────────────────────────    │
│  Entradas $10.2M (82%)  ·  Productos $2.2M (18%)                                     │
│  ┌ mini barras 7 días ── explica tendencia del recaudo ──────────────────────────┐   │
│  │ ▂▃▅▇█▆▄  Últimos 7 días                                                       │   │
│  └───────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                      │
│  ── Qué está funcionando mejor (aforo) ─────────────────────────────────────────    │
│  General  ████████████████████░░  620/800  78%  ·  $9.3M  ← explica el % total     │
│  VIP      ██████████░░░░░░░░░░░░  145/200   73%  ·  $2.9M                           │
│  Palco A  ████░░░░░░░░░░░░░░░░░░   12/20    60%  ·  $180K                          │
│                                                                                      │
│  ── Productos que impulsan el recaudo ───────────────────────────────────────────    │
│  Cerveza 89 uds · $890K   │   Agua 45 uds · $225K   │   [ Administrar → ]          │
│                                                                                      │
│  ── Actividad en puerta (asistentes) ────────────────────────────────────────────    │
│  ● Hace 10 min  Ingreso — General · Juan P.                                          │
│  ● Hace 3 min   Venta VIP — $290.000  (explica recaudo + futuros asistentes)         │
│                                                                                      │
├──────────────────────────────────────────────────────────────────────────────────────┤
│  ACCIONES RÁPIDAS                                                                    │
│  [ Operaciones ]  [ Escáner ]  [ Compartir ]  [ Boletas ]  [ Lectores ]              │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

**Above the fold (viewport 900px):** Hero + 3 protagonistas + "Qué hacer ahora".  
El empresario ya tiene respuesta completa en **un vistazo**.

---

## Wireframe — Mobile (Mobile First)

```
┌─────────────────────────────┐
│ ← Mis Eventos               │
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │   IMAGEN 16:9           │ │
│ └─────────────────────────┘ │
│ FESTIVAL ANDINO 2026        │
│ ● Publicado · 12 ago        │
│ ⏱ 5 días · 14 h             │
│ [Ver] [Compartir] [Escáner] │
├─────────────────────────────┤
│ EL PULSO DE TU EVENTO       │
│                             │
│ ┌─────────────────────────┐ │
│ │ 💰 RECAUDO TOTAL        │ │  ← card full width
│ │    $12.450.000          │ │
│ │    ↑ +12% vs ayer       │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ 📊 AFORO VENDIDO   78%  │ │
│ │ ████████████░░░░        │ │
│ │ 847 de 1.080 boletas    │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ 👥 ASISTENTES      312  │ │
│ │ 37% ya ingresaron       │ │
│ └─────────────────────────┘ │
├─────────────────────────────┤
│ ¿QUÉ HACER AHORA?           │
│ ┌ ev-notice ──────────────┐ │
│ │ Te quedan 233 boletas…  │ │
│ └─────────────────────────┘ │
│ [ Compartir evento ]        │
├─────────────────────────────┤
│ ↓ scroll explicativo        │
│ De dónde viene el recaudo   │
│ Qué vende mejor             │
│ Productos                   │
│ Actividad en puerta         │
│ Acciones                    │
└─────────────────────────────┘
```

**Mobile:** los 3 protagonistas en **stack vertical** (no carrusel de 6 KPIs). Cada uno respira. El scroll explicativo es opcional para profundizar.

---

## Capa explicativa — mapeo a protagonistas

| Sección | Explica | Protagonista | Componente DS |
|---------|---------|--------------|---------------|
| De dónde viene el recaudo | Mix entradas/productos + tendencia 7d | Recaudo | `ev-panel-summary` + barras CSS |
| Qué está funcionando mejor | Ranking tipos boleta | Aforo | `ev-panel-card` + barras horizontales |
| Productos que impulsan recaudo | Top 3 SKUs | Recaudo | `ev-panel-card` horizontal scroll |
| Actividad en puerta | Check-ins + ventas recientes | Asistentes + Recaudo | timeline `.ev-ops-timeline` |
| ¿Qué hacer ahora? | Reglas interpretativas | Acción | `ev-notice` + `ev-button` |

**Sin ventas:** los 3 protagonistas muestran `$0`, `0%`, `0` con copy motivacional — no ocultar el bloque.

---

## Insights — solo responden "¿qué debo hacer ahora?"

Máximo **1 insight prominente** + CTA. Reglas (frontend, sin IA):

| Prioridad | Condición | Mensaje | CTA |
|-----------|-----------|---------|-----|
| 1 | Sin ventas | "Aún no hay ventas. Publica y comparte tu evento." | Compartir |
| 2 | Aforo <30% y ≤7 días | "Quedan {N} días y has vendido el {X}% del aforo." | Compartir |
| 3 | Asistentes << vendidas (día evento) | "Hay {N} boletas vendidas pero solo {M} ingresos. Revisa accesos." | Escáner |
| 4 | Un tipo domina ≥70% | "La boleta {X} concentra el {N}% — considera promover {Y}." | Boletas |
| 5 | Productos >20% recaudo | "Los productos ya aportan {N}% — refuerza inventario." | Productos |
| 6 | Aforo ≥80% | "Has vendido el {N}% del aforo. Evalúa liberar más cupos." | Operaciones |

Insights **nunca** repiten el número protagonista sin aportar acción.

---

## Design System

| Uso | Componente |
|-----|------------|
| Pills estado hero | `ev-badge` |
| CTAs | `ev-button` |
| ¿Qué hacer ahora? | `ev-notice` |
| Empty states | `ev-empty-state` |
| Filas ranking / productos | `ev-panel-card` |
| Mix recaudo (entradas/productos) | `ev-panel-summary` (2 métricas) |
| Skeleton | patrón `.ev-ops-loading` |

**Tokens CSS:** heredar `--ev-ops-max`, `--ev-ops-radius`, `--ev-ops-shadow`, `--ev-ops-accent` → alias `--ev-intel-*`.

**No usar:** `DashboardKpisComponent`, tabs admin, tablas densas, `FinanzasDesgloseComponent`.

**Clase nueva (scoped):** `.ev-intel-pulse` — contenedor de los 3 protagonistas. No duplicar en DS global hasta segunda pantalla.

---

## Datos — servicios existentes

```typescript
// Carga parallel (sin backend nuevo)
const [evento, stats, reporte, ventasPorDia, tiposBoleta, productos] = await Promise.all([
  eventosService.getEventoById(id),
  dashboardOrganizadorService.getStats(orgId, id),
  reportesService.getReporteEvento(id),
  reportesService.getVentasPorDia(desde7d, hoy, orgId, id),
  boletasService.getTiposBoleta(id),
  productosService.getProductosPorEvento(id),
]);
```

### Cálculos protagonistas (client-side)

```typescript
recaudoTotal = (reporte?.ingresos ?? 0) + (stats.ingresos_productos_totales ?? 0);
aforoVendidoPct = sum(tipos.cantidad_vendidas) / sum(tipos.cantidad_total) * 100;
asistentes = reporte?.boletas_usadas ?? 0;
variacionRecaudo = compare(stats.ingresos_dia_actual, stats.ingresos_dia_anterior);
tasaIngreso = asistentes / (reporte?.boletas_vendidas || 1) * 100;
```

### Actividad (explica Asistentes + Recaudo)

Merge client-side: `stats.ventas_recientes` (filtro evento) + `getBoletasCompradas` con `fecha_uso`. Sin feed → `ev-empty-state`.

---

## Empty states

| Bloque | Empty | Copy |
|--------|-------|------|
| 3 protagonistas | 0 ventas | Valores en cero + "Comienza a vender" en contexto |
| De dónde viene recaudo | sin ventas | `ev-empty-state` "El desglose aparecerá con las primeras ventas." |
| Ranking boletas | sin tipos | "Configura boletas en Operaciones." |
| Productos | sin catálogo | "Agrega productos para vender en el evento." |
| Actividad | sin feed | "La actividad en vivo aparecerá aquí." |
| Insight | sin regla | Mostrar CTA genérico "Compartir evento" |

---

## Microinteracciones

| Elemento | Comportamiento |
|----------|----------------|
| 3 protagonistas | fade-in stagger 0.15s; hover desktop lift 2px |
| Barra aforo | animate width 0→N% en 0.5s |
| Secciones explicativas | fade-in al scroll (opcional, ligero) |
| Loading | skeleton de 3 cards grandes + hero |
| Refresh | pulse suave en protagonistas, no reload completo |

---

## Integración

| Desde | Hacia |
|-------|-------|
| Operaciones → "Ver inteligencia" / pulso | `/eventos/:id/inteligencia` |
| Inteligencia → Operaciones | header + acciones |
| Mis Eventos | operaciones o inteligencia (TBD) |

---

## Checklist pre-implementación

- [x] Principio: inteligencia, no estadísticas
- [x] 3 protagonistas definidos y visualmente dominantes
- [x] Capa explicativa subordinada a los 3
- [x] Wireframes desktop + mobile
- [x] DS = operaciones
- [x] Solo servicios existentes
- [ ] Aprobación del usuario
- [ ] Implementación fase 1: hero + pulso (3) + insight + skeleton

---

## Fases de implementación

| Fase | Entregable |
|------|------------|
| **1** | Ruta + hero + **3 protagonistas** + "qué hacer ahora" + loading |
| **2** | Capa explicativa: recaudo + ranking aforo |
| **3** | Productos + actividad + acciones |
| **4** | Mobile polish + integración operaciones |

**Referencia de código:** `evento-operaciones/` (hero, pulse, timeline, tokens CSS).
