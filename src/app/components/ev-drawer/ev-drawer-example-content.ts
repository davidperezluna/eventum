import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DrawerRef } from '../../core/drawer/drawer-ref';
import { EvDrawerContent } from '../../core/drawer/drawer-content.interface';
import { EvButton } from '../ev-button';

/**
 * Contenido de ejemplo para probar el sistema de drawers.
 * No usar en producción; referencia para implementar paneles reales.
 */
@Component({
  selector: 'ev-drawer-example-content',
  standalone: true,
  imports: [CommonModule, FormsModule, EvButton],
  template: `
    <div class="ev-drawer-example">
      <p class="ev-drawer-example__lead">
        Panel de ejemplo del sistema <strong>ev-drawer</strong>.
      </p>
      <label class="ev-drawer-example__field">
        <span>Campo de prueba</span>
        <input
          type="text"
          class="ev-input"
          [(ngModel)]="draft"
          (ngModelChange)="onDraftChange()"
          placeholder="Escribe algo para marcar cambios sin guardar"
        />
      </label>
      <div class="ev-drawer-example__actions">
        <ev-button variant="ghost" (click)="drawerRef.close()">Cerrar</ev-button>
        <ev-button variant="primary" (click)="save()">Guardar</ev-button>
      </div>
    </div>
  `,
  styles: [
    `
      .ev-drawer-example {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .ev-drawer-example__lead {
        margin: 0;
        font-size: 0.875rem;
        color: #64748b;
        line-height: 1.5;
      }
      .ev-drawer-example__field {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        font-size: 0.8125rem;
        font-weight: 600;
        color: #334155;
      }
      .ev-drawer-example__field .ev-input {
        width: 100%;
        padding: 0.65rem 0.75rem;
        border: 1px solid rgba(15, 23, 42, 0.12);
        border-radius: 10px;
        font: inherit;
      }
      .ev-drawer-example__actions {
        display: flex;
        gap: 0.5rem;
        justify-content: flex-end;
        padding-top: 0.5rem;
      }
    `,
  ],
})
export class EvDrawerExampleContent implements EvDrawerContent {
  readonly drawerRef = inject(DrawerRef);

  draft = '';
  private dirty = false;

  onDraftChange(): void {
    this.dirty = this.draft.trim().length > 0;
    if (this.dirty) {
      this.drawerRef.markDirty();
    } else {
      this.drawerRef.markPristine();
    }
  }

  evDrawerHasUnsavedChanges(): boolean {
    return this.dirty;
  }

  save(): void {
    this.dirty = false;
    this.drawerRef.markPristine();
    void this.drawerRef.close();
  }
}
