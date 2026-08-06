# Drawers y paneles

## Abrir un drawer

```typescript
import { DrawerService } from '../../core/drawer';
import { openEventoBoletasDrawer } from '../../panels/evento-boletas';

// En el componente
private readonly drawerService = inject(DrawerService);

openBoletasDrawer(): void {
  const ref = openEventoBoletasDrawer(this.drawerService, this.evento);

  void ref.afterClosed().then((result) => {
    if (!result?.changed) return;
    // Refrescar evento / readiness
  });
}
```

### Helper `open-evento-*-drawer.ts`

Cada módulo expone una función tipada que encapsula título, icono, tamaño y data:

```typescript
export function openEventoBoletasDrawer(
  drawerService: DrawerService,
  evento: Pick<Evento, 'id' | 'titulo'>,
): DrawerRef<EventoBoletasDrawerResult> {
  return drawerService.open<EventoBoletasPanel, EventoBoletasPanelData, EventoBoletasDrawerResult>(
    EventoBoletasPanel,
    {
      title: 'Boletas',
      description: evento.titulo,
      icon: 'confirmation_number',
      size: 'xl',
      data: { eventoId: evento.id, eventoTitulo: evento.titulo },
    },
  );
}
```

### Tamaños disponibles

| Size | Ancho máximo |
|------|--------------|
| `sm` | 22.5rem (360px) |
| `md` | 30rem (480px) |
| `lg` | 40rem (640px) |
| `xl` | 50rem (800px) |
| `fullscreen` | 100% |

**Guía:** formularios simples → `md`; dashboards con listas → `xl`.

## Panel embebido

### Anatomía HTML estándar

```html
<div class="ev-panel">
  <div class="ev-panel__body"><!-- o ev-panel__scroll -->
    <p class="ev-panel__lead">Texto introductorio del módulo.</p>

    <ev-panel-summary label="Resumen" [metrics]="summaryMetrics" />

    <ev-notice *ngIf="insight" variant="warning" [message]="insight" />

    <!-- Vista dashboard, lista, etc. -->

    <ev-panel-form>
      <div class="ev-form">
        <ev-form-section title="Sección" description="Ayuda opcional.">
          <div class="ev-form-grid ev-form-grid--2">
            <div class="ev-field">...</div>
          </div>
        </ev-form-section>
      </div>
    </ev-panel-form>
  </div>

  <ev-drawer-footer>
    <ev-button variant="ghost" (click)="closePanel()">Cerrar</ev-button>
    <ev-button variant="primary" [disabled]="!canSave" [loading]="saving" (click)="save()">
      Guardar
    </ev-button>
  </ev-drawer-footer>
</div>
```

### `:host` del panel

Todo panel debe ocupar la altura del drawer:

```css
:host {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  height: 100%;
}
```

## Inyección de datos

```typescript
import { DrawerRef, EV_DRAWER_DATA, EvDrawerContent } from '../../core/drawer';

export class EventoFechasPanel implements EvDrawerContent {
  readonly drawerRef = inject(DrawerRef<EventoFechasDrawerResult>);
  readonly data = inject<EventoFechasPanelData>(EV_DRAWER_DATA);
}
```

## Cambios sin guardar

Implementar `EvDrawerContent`:

```typescript
export class MiPanel implements EvDrawerContent {
  evDrawerHasUnsavedChanges(): boolean {
    return this.isDirty();
  }

  // Opcional: personalizar el diálogo de descarte
  evDrawerDiscardPrompt() {
    return {
      title: 'Descartar cambios',
      message: 'Tienes cambios sin guardar.',
      confirmText: 'Descartar',
      cancelText: 'Seguir editando',
    };
  }
}
```

Marcar dirty/pristine al editar:

```typescript
onFormChange(): void {
  if (this.isDirty()) {
    this.drawerRef.markDirty();
  } else {
    this.drawerRef.markPristine();
  }
}
```

## Loading state

```typescript
async loadData(): Promise<void> {
  this.drawerRef.setLoading(true);
  try {
    // fetch...
  } finally {
    this.drawerRef.setLoading(false);
    this.cdr.detectChanges();
  }
}
```

Mientras `loading === true`, el shell muestra `ev-drawer-skeleton`.

## Vistas internas (multi-step)

Boletas y Productos usan un patrón dashboard → formulario → inventario:

```html
<div *ngIf="view !== 'dashboard'" class="ev-panel__subnav">
  <button type="button" class="ev-panel__back" (click)="goToDashboard()">
    <span class="material-icons">arrow_back</span>
    Volver al resumen
  </button>
</div>

<div *ngIf="view === 'dashboard'" class="ev-panel__view ev-panel__dashboard">...</div>
<div *ngIf="view === 'form'" class="ev-panel__view" [class.ev-panel__view--forward]="...">...</div>
```

Clases de animación: `ev-panel__view--forward` / `ev-panel__view--back`.

## Footers por contexto

| Vista | Botones |
|-------|---------|
| Dashboard | `Cerrar` |
| Formulario | `Cancelar` + `Guardar` |
| Inventario | `Cancelar` + `Agregar unidades` |

## Deep link desde operaciones

El Centro de Operaciones soporta abrir drawers vía query param:

```
/eventos/123/operaciones?open=boletas
/eventos/123/operaciones?open=fechas
```

Valores: `boletas`, `productos`, `fechas`, `cobros`, `cupones`, `imagen`.

## Crear un nuevo módulo de drawer

1. Crear carpeta `src/app/panels/evento-{modulo}/`
2. Definir tipos: `{Modulo}PanelData`, `{Modulo}DrawerResult`
3. Implementar panel con anatomía estándar
4. Crear `open-evento-{modulo}-drawer.ts`
5. Registrar en `evento-readiness.ts` si aplica
6. Integrar en `evento-operaciones.ts`: dock, checklist, handler `?open=`
