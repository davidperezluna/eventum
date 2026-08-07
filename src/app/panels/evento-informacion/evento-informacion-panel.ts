import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DrawerRef, EV_DRAWER_DATA, EvDrawerContent } from '../../core/drawer';
import { EventosService } from '../../services/eventos.service';
import { CategoriasService } from '../../services/categorias.service';
import { AlertService } from '../../services/alert.service';
import { EvDrawerFooter } from '../../components/ev-drawer/ev-drawer-footer';
import { EvButton } from '../../components/ev-button';
import { EvSelect, EvSelectOption, mapToEvSelectOptions } from '../../components/ev-select/ev-select';
import { EvFormSection } from '../../components/ev-form-section/ev-form-section';
import { EvPanelForm } from '../../components/ev-panel-form';
import { CategoriaEvento, Evento } from '../../types';
import {
  EventoInformacionDrawerResult,
  EventoInformacionPanelData,
  InformacionFormSnapshot,
} from './evento-informacion.types';

@Component({
  selector: 'app-evento-informacion-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    EvDrawerFooter,
    EvButton,
    EvSelect,
    EvFormSection,
    EvPanelForm,
  ],
  templateUrl: './evento-informacion-panel.html',
  styleUrl: './evento-informacion-panel.css',
})
export class EventoInformacionPanel implements OnInit, EvDrawerContent {
  private readonly eventosService = inject(EventosService);
  private readonly categoriasService = inject(CategoriasService);
  private readonly alertService = inject(AlertService);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly drawerRef = inject(DrawerRef<EventoInformacionDrawerResult>);
  readonly data = inject<EventoInformacionPanelData>(EV_DRAWER_DATA);

  categorias: CategoriaEvento[] = [];
  categoriaOptions: EvSelectOption<number>[] = [];

  titulo = '';
  categoriaId: number | null = null;
  tags = '';
  descripcionCorta = '';
  descripcion = '';

  saving = false;
  private initialSnapshot = '';

  ngOnInit(): void {
    this.titulo = this.data.titulo ?? '';
    this.categoriaId = this.data.categoria_id ?? null;
    this.tags = this.data.tags ?? '';
    this.descripcionCorta = this.data.descripcion_corta ?? '';
    this.descripcion = this.data.descripcion ?? '';
    this.captureSnapshot();
    void this.loadCategorias();
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
    if (this.saving || !this.isDirty()) {
      return;
    }

    if (!this.validate()) {
      return;
    }

    this.saving = true;
    this.cdr.detectChanges();

    try {
      const payload: Partial<Evento> = {
        titulo: this.titulo.trim(),
        categoria_id: this.categoriaId ?? undefined,
        tags: this.tags.trim() || undefined,
        descripcion_corta: this.descripcionCorta.trim() || undefined,
        descripcion: this.descripcion.trim() || undefined,
      };

      const updated = await this.eventosService.updateEvento(this.data.eventoId, payload);

      this.captureSnapshot();
      this.alertService.success('Guardado', 'La información del evento se guardó correctamente.');
      this.drawerRef.markPristine();

      void this.drawerRef.close({
        changed: true,
        titulo: updated.titulo ?? this.titulo.trim(),
        categoria_id: updated.categoria_id ?? this.categoriaId,
        tags: (updated.tags ?? this.tags.trim()) || null,
        descripcion_corta: (updated.descripcion_corta ?? this.descripcionCorta.trim()) || null,
        descripcion: (updated.descripcion ?? this.descripcion.trim()) || null,
      });
    } catch (err) {
      console.error('Error guardando información del evento:', err);
      this.alertService.error('Error', 'No se pudo guardar la información del evento.');
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  private validate(): boolean {
    if (!this.titulo.trim()) {
      this.alertService.warning('Campo requerido', 'El título del evento es requerido.');
      return false;
    }
    if (!this.categoriaId) {
      this.alertService.warning('Campo requerido', 'Selecciona una categoría.');
      return false;
    }
    if (!this.descripcionCorta.trim() && !this.descripcion.trim()) {
      this.alertService.warning(
        'Campo requerido',
        'Agrega una descripción corta o una descripción completa.',
      );
      return false;
    }
    return true;
  }

  private async loadCategorias(): Promise<void> {
    this.drawerRef.setLoading(true);
    try {
      const response = await this.categoriasService.getCategorias({ activo: true, limit: 1000 });
      this.categorias = response.data ?? [];
      this.categoriaOptions = mapToEvSelectOptions(
        this.categorias,
        (c) => c.nombre,
        (c) => c.id,
      );
    } catch (err) {
      console.error('Error cargando categorías:', err);
      this.alertService.error('Error', 'No se pudieron cargar las categorías.');
      this.categorias = [];
      this.categoriaOptions = [];
    } finally {
      this.drawerRef.setLoading(false);
      this.cdr.detectChanges();
    }
  }

  private captureSnapshot(): void {
    this.initialSnapshot = JSON.stringify(this.getFormSnapshot());
  }

  private getFormSnapshot(): InformacionFormSnapshot {
    return {
      titulo: this.titulo,
      categoria_id: this.categoriaId,
      tags: this.tags,
      descripcion_corta: this.descripcionCorta,
      descripcion: this.descripcion,
    };
  }

  private isDirty(): boolean {
    return JSON.stringify(this.getFormSnapshot()) !== this.initialSnapshot;
  }
}
