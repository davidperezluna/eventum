import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DrawerRef, EV_DRAWER_DATA, EvDrawerContent } from '../../core/drawer';
import { CuponesService } from '../../services/cupones.service';
import { AlertService } from '../../services/alert.service';
import { CuponDescuento } from '../../types';
import { EvDrawerFooter } from '../../components/ev-drawer/ev-drawer-footer';
import { EvButton } from '../../components/ev-button';
import { EvNumberInput } from '../../components/ev-number-input/ev-number-input';
import { EvFormSection } from '../../components/ev-form-section/ev-form-section';
import { EvBadge } from '../../components/ev-badge';
import { EvEmptyState } from '../../components/ev-empty-state';
import { EvPanelSummary, EvPanelSummaryMetric } from '../../components/ev-panel-summary';
import { EvNotice } from '../../components/ev-notice';
import { EvPanelForm } from '../../components/ev-panel-form';

export interface EventoCuponesPanelData {
  eventoId: number;
  eventoTitulo: string;
}

@Component({
  selector: 'app-evento-cupones-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    EvDrawerFooter,
    EvButton,
    EvNumberInput,
    EvFormSection,
    EvBadge,
    EvEmptyState,
    EvPanelSummary,
    EvNotice,
    EvPanelForm,
  ],
  templateUrl: './evento-cupones-panel.html',
  styleUrl: './evento-cupones-panel.css',
})
export class EventoCuponesPanel implements OnInit, EvDrawerContent {
  private readonly cuponesService = inject(CuponesService);
  private readonly alertService = inject(AlertService);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly drawerRef = inject(DrawerRef<boolean>);
  readonly data = inject<EventoCuponesPanelData>(EV_DRAWER_DATA);

  cupones: CuponDescuento[] = [];
  saving = false;
  nuevoCupon: Partial<CuponDescuento> = this.buildEmptyCupon();
  private dataChanged = false;

  ngOnInit(): void {
    void this.loadCupones(true);
  }

  get summaryMetrics(): EvPanelSummaryMetric[] {
    const activos = this.cupones.filter((c) => c.activo).length;
    const usos = this.cupones.reduce((sum, c) => sum + (c.usos_actuales ?? 0), 0);
    return [
      { value: this.cupones.length, label: 'Cupones' },
      { value: activos, label: 'Activos', variant: 'accent' },
      { value: usos, label: 'Usos' },
    ];
  }

  get panelInsight(): { message: string; ctaLabel: string } | null {
    if (this.cupones.length === 0) {
      return {
        message: 'Crea un cupón de lanzamiento para incentivar las primeras compras.',
        ctaLabel: '',
      };
    }
    return null;
  }

  get canCreate(): boolean {
    const codigo = this.nuevoCupon.codigo?.trim() ?? '';
    return codigo.length >= 4 && (this.nuevoCupon.porcentaje_descuento ?? 0) > 0;
  }

  evDrawerHasUnsavedChanges(): boolean {
    return !!(this.nuevoCupon.codigo?.trim());
  }

  onFormChange(): void {
    if (this.nuevoCupon.codigo?.trim()) {
      this.drawerRef.markDirty();
    } else {
      this.drawerRef.markPristine();
    }
  }

  focusCreateForm(): void {
    document.getElementById('cupon-codigo')?.focus();
  }

  async loadCupones(showSkeleton = false): Promise<void> {
    if (showSkeleton) {
      this.drawerRef.setLoading(true);
    }
    try {
      this.cupones = await this.cuponesService.getCuponesByEvento(this.data.eventoId);
    } catch (err) {
      console.error('Error cargando cupones:', err);
      this.alertService.error('Error', 'No se pudieron cargar los cupones');
      this.cupones = [];
    } finally {
      if (showSkeleton) {
        this.drawerRef.setLoading(false);
      }
      this.cdr.detectChanges();
    }
  }

  async crearCupon(): Promise<void> {
    if (!this.canCreate) {
      this.alertService.warning('Campos incompletos', 'El código (mín. 4 caracteres) y el porcentaje son obligatorios');
      return;
    }

    this.saving = true;
    this.cdr.detectChanges();
    try {
      const payload: Partial<CuponDescuento> = {
        ...this.nuevoCupon,
        evento_id: this.data.eventoId,
        codigo: this.nuevoCupon.codigo!.toUpperCase().trim(),
        activo: true,
      };
      await this.cuponesService.crearCupon(payload);
      this.alertService.success('Guardado', 'El cupón se creó correctamente.');
      this.nuevoCupon = this.buildEmptyCupon();
      this.drawerRef.markPristine();
      this.dataChanged = true;
      await this.loadCupones();
    } catch (err: unknown) {
      console.error('Error creando cupón:', err);
      this.alertService.error('Error', 'No se pudo crear el cupón.');
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async toggleCuponActivo(cupon: CuponDescuento): Promise<void> {
    try {
      await this.cuponesService.actualizarCupon(cupon.id, { activo: !cupon.activo });
      this.dataChanged = true;
      this.alertService.success('Actualizado', 'El cupón se actualizó correctamente.');
      await this.loadCupones();
    } catch (err) {
      console.error('Error actualizando cupón:', err);
      this.alertService.error('Error', 'No se pudo actualizar el cupón.');
    }
  }

  async eliminarCupon(cupon: CuponDescuento): Promise<void> {
    const confirmed = await this.alertService.confirm(
      'Eliminar cupón',
      `¿Estás seguro de eliminar el cupón ${cupon.codigo}?`,
      'Sí, eliminar',
      'Cancelar',
    );
    if (!confirmed) {
      return;
    }

    try {
      await this.cuponesService.eliminarCupon(cupon.id);
      this.alertService.success('Eliminado', 'El cupón se eliminó correctamente.');
      this.dataChanged = true;
      await this.loadCupones();
    } catch (err) {
      console.error('Error eliminando cupón:', err);
      this.alertService.error('Error', 'No se pudo eliminar el cupón.');
    }
  }

  closePanel(): void {
    void this.drawerRef.close(this.dataChanged);
  }

  private buildEmptyCupon(): Partial<CuponDescuento> {
    return {
      evento_id: this.data.eventoId,
      codigo: '',
      porcentaje_descuento: 10,
      max_usos: 1,
      activo: true,
    };
  }
}
