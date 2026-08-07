# Componentes

Todos los componentes del Design System son **standalone** (Angular). Los de panel se reexportan desde `src/app/components/ev-panel/index.ts`.

---

## `ev-notice`

Banner informativo unificado. Reemplaza avisos ad-hoc (`alert-box`, `ev-panel-status`, banners custom).

### API

| Input | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `variant` | `'info' \| 'success' \| 'warning' \| 'danger'` | `'info'` | Estilo semántico |
| `density` | `'default' \| 'compact' \| 'inline'` | `'default'` | Densidad visual |
| `title` | `string` | `''` | Título opcional |
| `message` | `string` | `''` | Cuerpo de texto |
| `icon` | `string` | auto | Override de icono Material |
| `actionLabel` | `string` | `''` | Botón primario |
| `secondaryActionLabel` | `string` | `''` | Botón secundario |
| `ariaLabel` | `string` | `''` | Label accesible del region |

| Output | Descripción |
|--------|-------------|
| `actionClick` | Click en botón primario |
| `secondaryActionClick` | Click en botón secundario |

### Iconos por defecto

| Variant | Icono |
|---------|-------|
| `info` | `info` |
| `success` | `check_circle` |
| `warning` | `lightbulb` |
| `danger` | `error_outline` |

### Ejemplos

```html
<!-- Estado de configuración -->
<ev-notice
  variant="success"
  title="Fechas configuradas"
  message="Evento: 6 ago 2026 → 7 ago 2026"
/>

<!-- Recomendación con CTA -->
<ev-notice
  variant="warning"
  message="Crea tu primer tipo de boleta para empezar a vender."
  actionLabel="Crear boleta"
  (actionClick)="openCreateForm()"
/>

<!-- Una línea (showcase, preventa) -->
<ev-notice
  variant="warning"
  density="inline"
  icon="info"
  message="Modo demostración — los cambios no se publican."
/>

<!-- Contenido custom + acciones proyectadas -->
<ev-notice variant="info" icon="science" density="compact">
  <span>Modo prueba admin — flujo igual al de un cliente.</span>
  <div evNoticeActions class="mis-links">
    <button type="button" (click)="goCarrito()">Mi carrito</button>
  </div>
</ev-notice>
```

### Cuándo usar `ev-notice` vs `AlertService`

| Situación | Usar |
|-----------|------|
| Info persistente en pantalla | `ev-notice` |
| Recomendación / estado del módulo | `ev-notice` |
| Confirmación post-guardado | `AlertService.success()` |
| Error de red / validación puntual | `AlertService.warning()` / `.error()` |
| Confirmar eliminar | `AlertService.confirmDestructive()` o `.presetConfirm('delete-*')` |

Ver [dialogs.md](../../docs/design-system/dialogs.md) para el sistema completo.

---

## `ev-badge`

Pill de estado compacto.

```html
<ev-badge variant="success">Completo</ev-badge>
<ev-badge variant="warning">Pendiente</ev-badge>
<ev-badge variant="accent">Destacado</ev-badge>
```

Variantes: `success`, `warning`, `danger`, `neutral`, `accent`.

---

## `ev-panel-summary`

Tarjeta de métricas para el dashboard del drawer.

```html
<ev-panel-summary
  label="Resumen"
  [metrics]="[
    { value: 3, label: 'Tipos activos' },
    { value: '$45.000', label: 'Desde', variant: 'accent' },
    { value: nombreLargo, label: 'Lugar', variant: 'text' }
  ]"
  hint="Texto auxiliar opcional debajo del grid"
/>
```

### Variantes de métrica

| Variant | Uso |
|---------|-----|
| `default` | Números cortos |
| `hero` | Métrica protagonista (ocupa fila completa en grid hero) |
| `accent` | Valor en color primary |
| `text` | Texto largo (nombre, fechas); fuente más pequeña, max 2 líneas |

Grid: **2 columnas** por defecto; 4 columnas en pantallas ≥901px.

---

## `ev-empty-state`

Estado vacío comercial dentro de drawers.

```html
<ev-empty-state
  icon="confirmation_number"
  title="Aún no hay entradas"
  description="Crea tu primer tipo de boleta para empezar a vender."
/>
```

---

## `ev-panel-card`

Contenedor de ítem en listas del panel.

```html
<ev-panel-card [inactive]="!item.activo">
  <!-- contenido de fila -->
</ev-panel-card>
```

---

## `ev-panel-form`

Wrapper semántico para formularios dentro del drawer. Sin estilos propios relevantes; agrupa `.ev-form`.

---

## `ev-button`

Botón del DS. Variantes: `primary`, `secondary`, `ghost`, `danger`. Tamaños: `sm`, `md`.

```html
<ev-button variant="primary" [loading]="saving" [fullWidth]="true" (click)="save()">
  Guardar
</ev-button>
```

En footers de drawer, `ghost` = cancelar/cerrar; `primary` = acción principal.

---

## `ev-drawer-footer`

Footer fijo del panel. Proyecta botones via content.

```html
<ev-drawer-footer>
  <ev-button variant="ghost" (click)="closePanel()">Cerrar</ev-button>
  <ev-button variant="primary" [disabled]="!canSave" (click)="save()">Guardar</ev-button>
</ev-drawer-footer>
```

Estilos en `src/styles/ev-drawer-system.css`. En móvil los botones se apilan (`column-reverse`).

---

## `ev-form-section`

Sección de formulario con icono, título y descripción corta. Cada bloque es una tarjeta independiente (estilos en `ev-form-system.css`).

```html
<ev-form-section
  icon="event"
  title="Información básica"
  description="Lo primero que verá el comprador."
>
  <div class="ev-form-grid ev-form-grid--2">...</div>
</ev-form-section>
```

Grids disponibles: `--2`, `--3`. Span completo: `ev-form-span-2`.

---

## Date & Time System (oficial)

Motor interno: **Angular Material Datepicker** (Luxon) + **`ev-time-picker`** propio.  
**Nunca** importar `@angular/material` ni librerías de fecha en pantallas — solo componentes `ev-*`.

| Componente | Uso | Valor |
|------------|-----|-------|
| `ev-date-picker` | Solo fecha | `YYYY-MM-DD` |
| `ev-time-picker` | Solo hora | `HH:mm` (24h) |
| `ev-date-time-picker` | Fecha + hora separadas | `YYYY-MM-DDTHH:mm` |
| `ev-datetime-period` | Rango inicio/fin | dos `datetime-local` |

Estilos: `src/styles/ev-datetime-picker.css`, `src/styles/ev-material-datepicker.css` (panel calendario).

```html
<ev-date-picker id="desde" [(ngModel)]="fechaDesde" />

<ev-time-picker id="apertura" [(ngModel)]="horaApertura" [minuteStep]="15" />

<ev-date-time-picker id="inicio" [(ngModel)]="fechaInicio" [disabled]="saving" />

<ev-datetime-period
  startLabel="Venta inicia"
  endLabel="Venta termina"
  [(start)]="fechaVentaInicio"
  [(end)]="fechaVentaFin"
  [required]="true"
/>
```

`ev-datetime-input` permanece como alias de compatibilidad; preferir `ev-date-time-picker`.

---

## `ev-number-input`

Input numérico con formato agrupado. Opciones visuales:

| Input | Uso |
|-------|-----|
| `prefix="$"` | Campos de precio |
| `[stepper]="true"` | Cantidades e inventario |

```html
<ev-number-input id="precio" mode="integer" prefix="$" [min]="0" [(ngModel)]="precio" />
<ev-number-input id="cantidad" mode="integer" [stepper]="true" [min]="1" [(ngModel)]="cantidad" />
```

---

## Clases de layout (CSS)

Definidas en `ev-panel-system.css`:

| Clase | Uso |
|-------|-----|
| `.ev-panel` | Contenedor flex column del módulo |
| `.ev-panel__scroll` / `.ev-panel__body` | Área scrolleable con padding |
| `.ev-panel__lead` | Párrafo introductorio |
| `.ev-panel__dashboard` | Stack vertical del dashboard |
| `.ev-panel-overview` | Tarjeta key-value (fechas) |
| `.ev-panel-list` | Tabla/lista con borde |
| `.ev-panel-link` | Enlace de acción en fila |

### Overview card (fechas)

Para datos estructurados tipo key-value, preferir `.ev-panel-overview` sobre meter fechas largas en `ev-panel-summary`:

```html
<section class="ev-panel-overview ev-panel-overview--complete">
  <div class="ev-panel-overview__header">...</div>
  <dl class="ev-panel-overview__list">
    <div class="ev-panel-overview__row">
      <dt>Lugar</dt>
      <dd>{{ lugarLabel }}</dd>
    </div>
  </dl>
</section>
```
