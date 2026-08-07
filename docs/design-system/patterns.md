# Patrones de interacción

## Alertas y diálogos

Sistema unificado `ev-dialog` (ver [dialogs.md](./dialogs.md)). `AlertService` delega en `EvDialogService` — ya no usa SweetAlert2.

Títulos consistentes en drawers:

| Acción | Título | Ejemplo mensaje |
|--------|--------|-----------------|
| Crear / guardar | `Guardado` | "El producto se creó correctamente." |
| Editar | `Actualizado` | "El cupón se actualizó correctamente." |
| Eliminar | `Eliminado` | "El cupón se eliminó correctamente." |
| Desactivar | `Desactivado` | "El producto fue desactivado." |
| Validación | `Campo requerido` / `Valor inválido` | Mensaje específico |
| Error API | `Error` | "No se pudieron cargar los productos" |

```typescript
this.alertService.success('Guardado', 'Las fechas y el lugar se guardaron correctamente.');
this.alertService.warning('Campo requerido', 'Las fechas de venta son requeridas.');
this.alertService.error('Error', 'No se pudo guardar la configuración de cobros.');
await this.alertService.presetConfirm('delete-coupon', {
  message: `El código ${codigo} dejará de estar disponible.`,
});
```

---

## Footers unificados

Regla general para todos los drawers de operaciones:

```
Dashboard  →  [ Cerrar ]
Formulario →  [ Cancelar ]  [ Guardar ]
Inventario →  [ Cancelar ]  [ Agregar unidades ]
```

- `Cerrar` / `Cancelar`: `ev-button variant="ghost"`
- Acción principal: `ev-button variant="primary"` con `[loading]` y `[disabled]`

---

## Checklist de readiness

`buildEventoReadiness()` en `src/app/core/evento-readiness.ts` calcula el progreso del evento.

### Pasos

| ID | Label | Acción drawer |
|----|-------|---------------|
| `informacion` | Información | wizard (legacy) |
| `imagen` | Imagen | `imagen` |
| `fechas` | Fechas y lugar | `fechas` |
| `boletas` | Boletas | `boletas` |
| `cobros` | Cobros | `cobros` |
| `productos` | Ventas adicionales | `productos` |
| `publicacion` | Publicación | publish |

Pasos completos y re-abribles (boletas, productos, fechas) permiten editar después de completar.

---

## Formularios en drawers

### Snapshot para dirty-check

```typescript
private initialSnapshot = '';

private captureSnapshot(): void {
  this.initialSnapshot = JSON.stringify(this.getFormSnapshot());
}

private isDirty(): boolean {
  return JSON.stringify(this.getFormSnapshot()) !== this.initialSnapshot;
}
```

### Cerrar con resultado

```typescript
void this.drawerRef.close({
  changed: true,
  // ...campos actualizados para merge en operaciones
});
```

En `evento-operaciones.ts`, preferir `getEventoById()` en `afterClosed()` para refrescar datos completos (relaciones incluidas).

---

## Listas en paneles

### Tabla (cupones)

```html
<div class="ev-panel-list">
  <table class="ev-panel-list__table">...</table>
</div>
```

### Cards (boletas, productos)

Cada ítem en `ev-panel-card` con menú contextual (tres puntos) y badges de estado.

---

## Empty states comerciales

Cuando la lista está vacía, mostrar `ev-empty-state` con mensaje orientado a conversión, no solo "No hay datos":

```html
<ev-empty-state
  icon="storefront"
  title="Aumenta los ingresos de tu evento"
  description="Agrega bebidas, comida o merchandising para generar ventas adicionales."
/>
```

Debajo, el CTA principal del módulo (`ev-button` full width).

---

## Insights → avisos

Las antiguas "recomendaciones" (`ev-panel-insight`) ahora son:

```html
<ev-notice variant="warning" [message]="insight.message" [actionLabel]="insight.ctaLabel" />
```

Mostrar solo cuando aporta valor (config incompleta, oportunidad de mejora como "asignar lugar").

---

## Showcase / demo

Organizadores en modo showcase ven un aviso inline global:

```html
<ev-notice
  variant="warning"
  density="inline"
  icon="info"
  message="Modo demostración — los cambios no se publican ni procesan pagos reales."
/>
```

Montado en `layout.html` cuando `authService.isShowcaseOrganizador()`.

---

## Excepciones (fuera del DS por ahora)

| Componente | Motivo |
|------------|--------|
| `pwa-install-banner` | Barra fija promocional con gradiente y acciones de instalación PWA |
| Wizard de eventos (`eventos.html`) | Pendiente migración a drawers |
| Páginas cliente (carrito, detalle) | Parcialmente migradas; avisos usan `ev-notice` donde aplica |

Estos se irán incorporando o documentando en fases posteriores.
