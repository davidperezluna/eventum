# Centro de Operaciones

Documentación de producto para la pantalla **Centro de operaciones del evento** — el hub desde el que un organizador prepara, publica y opera un evento.

## Propósito

Centralizar en una sola vista todo lo necesario para llevar un evento de **borrador** a **publicado y vendiendo**, sin navegar entre pantallas dispersas del admin.

**Ruta:** `/eventos/:id/operaciones`  
**Usuario:** organizador autenticado (dueño del evento)  
**Entrada habitual:** Mis Eventos → seleccionar evento → Centro de operaciones

---

## Qué resuelve

| Antes | Ahora |
|-------|-------|
| Wizard largo para cada ajuste | Drawers contextuales por módulo |
| No se veía el progreso global | Checklist con % de readiness |
| Métricas en otra pantalla | Pulso del evento en la misma vista |
| Publicar sin saber qué falta | Bloqueo de publicación hasta 100% |

---

## Anatomía de la pantalla

```
┌─────────────────────────────────────────────────┐
│  ← Mis Eventos                                  │
├─────────────────────────────────────────────────┤
│  HERO: imagen | título, meta, pills, contexto   │
│  LIFECYCLE: Borrador → Publicado → En curso …   │
├─────────────────────────────────────────────────┤
│  READINESS: % + checklist + siguiente paso      │
├─────────────────────────────────────────────────┤
│  BARRA OPS (desktop): Boletas, Productos, …      │
├─────────────────────────────────────────────────┤
│  PULSO: KPIs ventas, ingresos, asistentes       │
├─────────────────────────────────────────────────┤
│  TIMELINE          │  CONFIG AVANZADA            │
├─────────────────────────────────────────────────┤
│  DOCK móvil: Boletas | Productos | Escanear | + │
└─────────────────────────────────────────────────┘
```

### 1. Hero

- **Imagen clickeable** → drawer Imagen
- **Título, fecha, lugar**
- **Pills de estado:** borrador / publicado / en curso / finalizado / cancelado + catálogo activo/inactivo + destacado
- **Banner contextual** según estado del evento
- **Acción primaria** (cambia según lifecycle, ver abajo)
- **Barra de lifecycle** para transiciones de estado manual

### 2. Readiness (checklist de producción)

Mide qué tan listo está el evento para vender. El porcentaje cuenta solo pasos **obligatorios** (6 de 7; productos es opcional).

| Paso | Obligatorio | Criterio de "completo" | Cómo se configura |
|------|-------------|------------------------|-------------------|
| Información | ✅ | Título + categoría + descripción (corta o larga) | Wizard `/eventos?edit=:id` |
| Imagen | ✅ | `imagen_principal` definida | Drawer Imagen (o click en hero) |
| Fechas | ✅ | Inicio/fin evento + inicio/fin venta | Drawer Fechas y lugar |
| Boletas | ✅ | ≥1 tipo activo con stock disponible | Drawer Boletas |
| Cobros | ✅ | Evento gratis **o** cuenta Wompi asignada | Drawer Cobros |
| Productos | ❌ Opcional | ≥1 producto creado | Drawer Productos |
| Publicación | ✅ | Estado `PUBLICADO` y `activo = true` | Botón publicar / lifecycle |

**Re-abribles cuando completos:** imagen, fechas, cobros, boletas, productos.  
**No re-abrible:** información (vía wizard), publicación (acción, no drawer).

El bloque **"Siguiente paso recomendado"** guía al primer paso obligatorio pendiente. Al llegar al 100%, el CTA pasa a "Ver evento" o acciones de operación.

### 3. Barra de operaciones

Acciones frecuentes durante la operación del evento:

| Acción | Comportamiento |
|--------|----------------|
| Boletas | Drawer XL |
| Productos | Drawer XL (ventas adicionales) |
| Escanear | Navega a `/escanear-qr` |
| Ventas | Navega a `/ventas?eventoId=` (bloqueado en modo demo) |
| Cupones | Drawer MD |
| Más | Desktop: scroll a config avanzada. Móvil: bottom sheet |

**Nota:** Fechas, Cobros e Imagen se acceden desde el **checklist** o el hero, no desde la barra principal.

### 4. Pulso del evento

KPIs en tiempo real:
- Boletas vendidas
- Ingresos (+ tendencia día vs ayer)
- Asistentes (boletas usadas)
- Cupones usados

Estado vacío si aún no hay ventas: "Publica tu evento para comenzar."

### 5. Historial (timeline)

Hitos del ciclo de vida con fechas reales cuando existen (creación, publicación, inicio venta, inicio evento, etc.). Fuente: `buildEventoTimeline()`.

### 6. Configuración avanzada

Accesos secundarios:
- Editar información (wizard)
- Ver evento público
- Lectores y permisos
- Dashboard analítico

---

## Ciclo de vida del evento

Estados en orden lógico:

```
Borrador → Publicado → En curso → Finalizado
                              ↘ Cancelado
```

| Estado | Significado para el organizador |
|--------|----------------------------------|
| **Borrador** | No visible al público. En preparación. |
| **Publicado** | En catálogo, puede vender entradas. |
| **En curso** | El evento está ocurriendo ahora. |
| **Finalizado** | Terminó. Solo consulta / estadísticas. |
| **Cancelado** | Evento cancelado. |

La barra de lifecycle permite cambiar estado manualmente (con restricciones en modo showcase).

### Acción primaria del hero

| Estado actual | Botón principal |
|---------------|-----------------|
| Borrador | Publicar evento (requiere 100% readiness) |
| Publicado | Quitar del catálogo / Activar catálogo |
| En curso / Finalizado / Cancelado | Ver evento |

---

## Drawers del Centro de Operaciones

| Drawer | Tamaño | Función principal |
|--------|--------|-------------------|
| **Boletas** | XL | Tipos de entrada, precios, inventario, mapa |
| **Productos** | XL | Ventas adicionales (bebidas, merch, etc.) |
| **Fechas y lugar** | MD | Fechas evento/venta, lugar, edad mínima |
| **Cobros** | MD | Gratis vs pago, Wompi, comisión servicio |
| **Cupones** | MD | Crear y gestionar códigos de descuento |
| **Imagen** | MD | Imagen principal del evento |

### Deep links

Abrir un drawer directamente al cargar:

```
/eventos/42/operaciones?open=boletas
/eventos/42/operaciones?open=fechas
/eventos/42/operaciones?open=productos
/eventos/42/operaciones?open=imagen
```

Valores soportados: `boletas`, `productos`, `fechas`, `imagen`.  
(Cobros y cupones: solo vía checklist / barra.)

---

## Reglas de publicación

1. Readiness debe estar al **100%** (todos los pasos obligatorios completos).
2. En **modo showcase/demo**, la publicación está deshabilitada con aviso informativo.
3. Publicar actualiza `estado = PUBLICADO` y `activo = true`.
4. Si falta configuración, se muestra warning con cantidad de pasos pendientes.

---

## Modo showcase (demostración)

Organizadores demo (`isShowcaseOrganizador()`):
- Banner global: "Modo demostración — los cambios no se publican ni procesan pagos reales."
- No pueden publicar al catálogo real.
- Ventas bloqueadas en la barra de ops.
- Cobros: cuenta Wompi opcional (para ver el flujo sin vincular pagos reales).
- Lifecycle: paso "Publicado" deshabitado en la barra.

Reset de datos demo: `docs/showcase-reset.sql`

---

## Flujos típicos

### Crear evento nuevo y publicar

```
1. Crear evento (wizard / Mis Eventos)
2. Entrar a Centro de operaciones
3. Completar checklist: info → imagen → fechas → boletas → cobros
4. (Opcional) Agregar productos
5. Publicar evento
6. Verificar pulso cuando lleguen ventas
```

### Operar evento publicado

```
1. Revisar pulso (ventas, ingresos)
2. Ajustar boletas/productos vía drawers si hace falta
3. Escanear QR en puerta
4. Gestionar cupones
5. Consultar ventas / analítica
```

### Editar fechas después de publicar

```
1. Checklist → Fechas (re-abrible aunque esté ✓)
2. Guardar en drawer
3. Hero y timeline se actualizan
```

---

## Mobile vs desktop

| Elemento | Desktop | Móvil |
|----------|---------|-------|
| Barra de ops | Horizontal bajo readiness | Oculta |
| Acciones rápidas | Barra | Dock inferior fijo |
| "Más" | Scroll a config avanzada | Bottom sheet |
| Drawers | Panel lateral | Sheet desde abajo (≤768px) |
| Timeline + avanzada | 2 columnas | 1 columna apilada |

---

## Qué NO está en operaciones (aún)

| Feature | Estado |
|---------|--------|
| Editar info básica inline | Sigue en wizard (`/eventos?edit=`) |
| Mis Eventos → operaciones directo | Roadmap |
| Dashboard organizador unificado | Roadmap |
| Ventas en modo demo | Bloqueado a propósito |
| PWA install banner | Componente separado, no drawer |

---

## Relación con código

| Concepto producto | Archivo |
|-------------------|---------|
| Pantalla operaciones | `pages/evento-operaciones/` |
| Checklist / % | `core/evento-readiness.ts` |
| Drawers | `panels/evento-*/` |
| Design System | [docs/design-system/](./design-system/README.md) |
| Crear nuevo drawer | [creating-a-drawer.md](./design-system/creating-a-drawer.md) |
