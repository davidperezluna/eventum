# Guía: crear un drawer de operaciones

Paso a paso para añadir un nuevo módulo lateral al Centro de Operaciones, siguiendo el patrón establecido por **Fechas** (formulario simple) y **Boletas** (dashboard multi-vista).

## Cuándo usar un drawer

| Escenario | Solución |
|-----------|----------|
| Configurar algo del evento sin salir de operaciones | Drawer |
| CRUD con listado + formulario + sub-vistas | Drawer `xl` multi-vista |
| Formulario corto (≤6 campos) | Drawer `md` |
| Flujo largo de creación inicial | Wizard (`/eventos`) — migrar a drawer después |

## Checklist de implementación

- [ ] Carpeta `src/app/panels/evento-{modulo}/`
- [ ] Tipos (`PanelData`, `DrawerResult`, snapshot del form)
- [ ] Panel (`*-panel.ts|html|css`)
- [ ] Helper `open-evento-{modulo}-drawer.ts`
- [ ] Barrel `index.ts`
- [ ] Integración en `evento-operaciones.ts`
- [ ] Paso en `evento-readiness.ts` (si aplica)
- [ ] Query param `?open={modulo}` (opcional)

---

## Paso 1 — Crear la carpeta y tipos

```
src/app/panels/evento-ejemplo/
├── evento-ejemplo.types.ts
├── evento-ejemplo-panel.ts
├── evento-ejemplo-panel.html
├── evento-ejemplo-panel.css
├── open-evento-ejemplo-drawer.ts
└── index.ts
```

### `evento-ejemplo.types.ts`

```typescript
export interface EventoEjemploPanelData {
  eventoId: number;
  eventoTitulo: string;
  // campos iniciales del formulario
}

export interface EventoEjemploDrawerResult {
  changed: boolean;
  // campos que operaciones necesita para refrescar
}

export interface EjemploFormSnapshot {
  // serializable para dirty-check (strings, numbers, null)
}
```

**Reglas:**
- `PanelData` = lo que recibe el panel al abrir (via `EV_DRAWER_DATA`).
- `DrawerResult` = lo que devuelve `drawerRef.close()`. Siempre incluir `changed: boolean`.
- `FormSnapshot` = estado del form serializable a JSON para comparar dirty.

---

## Paso 2 — Implementar el panel

### TypeScript mínimo

```typescript
import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DrawerRef, EV_DRAWER_DATA, EvDrawerContent } from '../../core/drawer';
import { EventosService } from '../../services/eventos.service';
import { AlertService } from '../../services/alert.service';
import { EvDrawerFooter } from '../../components/ev-drawer/ev-drawer-footer';
import { EvButton } from '../../components/ev-button';
import { EvNotice } from '../../components/ev-notice';
import { EvPanelForm } from '../../components/ev-panel-form';
import { EventoEjemploDrawerResult, EventoEjemploPanelData, EjemploFormSnapshot } from './evento-ejemplo.types';

@Component({
  selector: 'app-evento-ejemplo-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, EvDrawerFooter, EvButton, EvNotice, EvPanelForm],
  templateUrl: './evento-ejemplo-panel.html',
  styleUrl: './evento-ejemplo-panel.css',
})
export class EventoEjemploPanel implements OnInit, EvDrawerContent {
  private readonly eventosService = inject(EventosService);
  private readonly alertService = inject(AlertService);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly drawerRef = inject(DrawerRef<EventoEjemploDrawerResult>);
  readonly data = inject<EventoEjemploPanelData>(EV_DRAWER_DATA);

  saving = false;
  private initialSnapshot = '';

  ngOnInit(): void {
    // inicializar campos desde this.data
    this.captureSnapshot();
    // void this.loadAuxData();
  }

  get canSave(): boolean {
    return this.isDirty();
  }

  evDrawerHasUnsavedChanges(): boolean {
    return this.isDirty();
  }

  onFormChange(): void {
    if (this.isDirty()) {
      this.drawerRef.markDirty();
    } else {
      this.drawerRef.markPristine();
    }
  }

  closePanel(): void {
    void this.drawerRef.close({ changed: false });
  }

  async save(): Promise<void> {
    if (this.saving || !this.isDirty()) return;
    if (!this.validate()) return;

    this.saving = true;
    this.cdr.detectChanges();
    try {
      await this.eventosService.updateEvento(this.data.eventoId, { /* payload */ });
      this.captureSnapshot();
      this.alertService.success('Guardado', 'Los cambios se guardaron correctamente.');
      this.drawerRef.markPristine();
      void this.drawerRef.close({ changed: true });
    } catch {
      this.alertService.error('Error', 'No se pudieron guardar los cambios.');
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  private validate(): boolean {
    // alertService.warning(...) + return false
    return true;
  }

  private captureSnapshot(): void {
    this.initialSnapshot = JSON.stringify(this.getFormSnapshot());
  }

  private getFormSnapshot(): EjemploFormSnapshot {
    return { /* estado actual */ };
  }

  private isDirty(): boolean {
    return JSON.stringify(this.getFormSnapshot()) !== this.initialSnapshot;
  }
}
```

### HTML mínimo

```html
<div class="ev-panel">
  <div class="ev-panel__scroll">
    <p class="ev-panel__lead">Descripción breve del módulo.</p>

    <ev-notice *ngIf="showHint" variant="warning" [message]="hintMessage" />

    <ev-panel-form>
      <div class="ev-form">
        <ev-form-section title="Sección" description="Ayuda opcional.">
          <!-- campos -->
        </ev-form-section>
      </div>
    </ev-panel-form>
  </div>

  <ev-drawer-footer>
    <ev-button variant="ghost" [disabled]="saving" (click)="closePanel()">Cerrar</ev-button>
    <ev-button variant="primary" [disabled]="!canSave" [loading]="saving" (click)="save()">Guardar</ev-button>
  </ev-drawer-footer>
</div>
```

### CSS del panel

```css
:host {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  height: 100%;
}
```

---

## Paso 3 — Helper de apertura

```typescript
// open-evento-ejemplo-drawer.ts
import { DrawerRef, DrawerService } from '../../core/drawer';
import { Evento } from '../../types';
import { EventoEjemploPanel } from './evento-ejemplo-panel';
import { EventoEjemploDrawerResult, EventoEjemploPanelData } from './evento-ejemplo.types';

export function openEventoEjemploDrawer(
  drawerService: DrawerService,
  evento: Pick<Evento, 'id' | 'titulo' /* + campos necesarios */>,
): DrawerRef<EventoEjemploDrawerResult> {
  return drawerService.open<EventoEjemploPanel, EventoEjemploPanelData, EventoEjemploDrawerResult>(
    EventoEjemploPanel,
    {
      title: 'Título del drawer',
      description: evento.titulo,
      icon: 'settings',        // Material icon
      size: 'md',              // sm | md | lg | xl
      data: {
        eventoId: evento.id,
        eventoTitulo: evento.titulo,
      },
    },
  );
}
```

### Barrel

```typescript
// index.ts
export { EventoEjemploPanel } from './evento-ejemplo-panel';
export { openEventoEjemploDrawer } from './open-evento-ejemplo-drawer';
export type { EventoEjemploPanelData, EventoEjemploDrawerResult } from './evento-ejemplo.types';
```

---

## Paso 4 — Integrar en operaciones

### Import y método

```typescript
// evento-operaciones.ts
import { openEventoEjemploDrawer } from '../../panels/evento-ejemplo';

openEjemploDrawer(): void {
  if (!this.evento) return;
  this.showMoreSheet = false;

  const ref = openEventoEjemploDrawer(this.drawerService, this.evento);

  void ref.afterClosed().then(async (result) => {
    if (!result?.changed) return;

    // Preferir refresh completo si hay relaciones anidadas:
    try {
      this.evento = await this.eventosService.getEventoById(this.eventoId);
    } catch {
      this.evento = { ...this.evento!, /* merge parcial */ };
    }
    this.rebuildReadiness();
    this.rebuildTimeline();
    this.cdr.detectChanges();
  });
}
```

### Conectar al checklist

En `onReadinessStepClick()`:

```typescript
case 'ejemplo':
  this.openEjemploDrawer();
  break;
```

Pasos **re-abribles** cuando están completos (patrón actual):

```typescript
if (step.complete && step.id !== 'publicacion' && step.id !== 'imagen' && step.id !== 'fechas' && /* ... */) {
  return; // bloquear solo pasos NO re-abribles
}
```

Añade tu `step.id` a la lista de re-abribles si el organizador debe poder editar después de completar.

### Deep link (opcional)

En `loadPage()`, junto a los otros `?open=`:

```typescript
} else if (this.route.snapshot.queryParamMap.get('open') === 'ejemplo') {
  this.openEjemploDrawer();
  void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
}
```

URL: `/eventos/123/operaciones?open=ejemplo`

---

## Paso 5 — Readiness (si el paso es obligatorio u opcional)

En `src/app/core/evento-readiness.ts`:

```typescript
export type EventoReadinessStepId = /* ... */ | 'ejemplo';

// función hasEjemplo(...)
// añadir step al array en buildEventoReadiness()
{
  id: 'ejemplo',
  label: 'Mi paso',
  complete: hasEjemplo(evento),
  optional: true,           // omitir si es obligatorio
  action: 'ejemplo',          // nuevo action type
}

// getNextStepActionLabel + getNextStepMessage
```

Actualizar el tipo `action` en `EventoReadinessStep` y el `switch` en operaciones.

---

## Variante multi-vista (Boletas / Productos)

Para módulos con listado + formulario + inventario:

```
view: 'dashboard' | 'form' | 'inventory'
```

| Vista | Contenido | Footer |
|-------|-----------|--------|
| `dashboard` | summary, CTA, lista, empty state | Cerrar |
| `form` | subnav back, formulario | Cancelar + Guardar |
| `inventory` | subnav back, ajuste stock | Cancelar + Agregar unidades |

Usar clases `ev-panel__view`, `ev-panel__view--forward`, `ev-panel__view--back` para animación.

Referencia: `src/app/panels/evento-boletas/`.

---

## Convenciones de alertas

| Evento | Título |
|--------|--------|
| Guardar nuevo | `Guardado` |
| Editar existente | `Actualizado` |
| Eliminar | `Eliminado` |
| Desactivar | `Desactivado` |
| Validación | `Campo requerido` / `Valor inválido` |
| Error API | `Error` |

---

## Errores comunes

| Problema | Causa | Solución |
|----------|-------|----------|
| Drawer no abre | Falta `ev-drawer-host` en layout | Verificar `layout.html` |
| Scroll doble | Panel sin `:host { height: 100% }` | Añadir CSS del host |
| Cierre no detecta cambios | No implementar `EvDrawerContent` | Añadir `evDrawerHasUnsavedChanges()` |
| Readiness no actualiza | Merge parcial incompleto | Usar `getEventoById()` en `afterClosed` |
| `lugar_id: null` en payload | Tipo `Partial<Evento>` | Usar `undefined` en lugar de `null` |

---

## Referencias en el repo

| Módulo | Complejidad | Archivo clave |
|--------|-------------|---------------|
| Fechas | Formulario simple | `panels/evento-fechas/` |
| Cobros | Formulario + summary | `panels/evento-cobros/` |
| Cupones | Form + tabla | `panels/evento-cupones/` |
| Imagen | Upload | `panels/evento-imagen/` |
| Boletas | Multi-vista XL | `panels/evento-boletas/` |
| Productos | Multi-vista XL | `panels/evento-productos/` |
