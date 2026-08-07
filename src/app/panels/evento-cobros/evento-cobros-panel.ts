import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DrawerRef, EV_DRAWER_DATA, EvDrawerContent } from '../../core/drawer';
import { EventosService } from '../../services/eventos.service';
import { WompiCuentasService } from '../../services/wompi-cuentas.service';
import { AuthService } from '../../services/auth.service';
import { AlertService } from '../../services/alert.service';
import { EvDrawerFooter } from '../../components/ev-drawer/ev-drawer-footer';
import { EvButton } from '../../components/ev-button';
import { EvSelect, EvSelectOption, mapToEvSelectOptions } from '../../components/ev-select/ev-select';
import { EvNumberInput } from '../../components/ev-number-input/ev-number-input';
import { EvFormSection } from '../../components/ev-form-section/ev-form-section';
import { EvNotice } from '../../components/ev-notice';
import { EvPanelForm } from '../../components/ev-panel-form';
import { isEventoCobrosConfigured } from '../../core/evento-readiness';
import { WompiCuenta } from '../../types';
import { EventoCobrosDrawerResult, EventoCobrosPanelData } from './evento-cobros.types';

interface CobrosFormSnapshot {
  esGratis: boolean;
  porcentajeServicio: number;
  wompiCuentaId: number | null;
}

@Component({
  selector: 'app-evento-cobros-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, EvDrawerFooter, EvButton, EvSelect, EvNumberInput, EvFormSection, EvNotice, EvPanelForm],
  templateUrl: './evento-cobros-panel.html',
  styleUrl: './evento-cobros-panel.css',
})
export class EventoCobrosPanel implements OnInit, EvDrawerContent {
  private readonly eventosService = inject(EventosService);
  private readonly wompiCuentasService = inject(WompiCuentasService);
  private readonly authService = inject(AuthService);
  private readonly alertService = inject(AlertService);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly drawerRef = inject(DrawerRef<EventoCobrosDrawerResult>);
  readonly data = inject<EventoCobrosPanelData>(EV_DRAWER_DATA);

  esGratis = false;
  porcentajeServicio = 0;
  wompiCuentaId: number | null = null;
  wompiCuentas: WompiCuenta[] = [];
  wompiCuentaOptions: EvSelectOption<number>[] = [];
  saving = false;

  private initialSnapshot = '';

  ngOnInit(): void {
    this.esGratis = this.data.es_gratis;
    this.porcentajeServicio = this.data.porcentaje_servicio;
    this.wompiCuentaId = this.data.wompi_cuenta_id;
    this.captureSnapshot();
    void this.loadWompiCuentas();
  }

  get isShowcaseMode(): boolean {
    return this.authService.isShowcaseOrganizador();
  }

  get configComplete(): boolean {
    return isEventoCobrosConfigured({
      es_gratis: this.esGratis,
      wompi_cuenta_id: this.wompiCuentaId,
    });
  }

  get canSave(): boolean {
    return this.isDirty();
  }

  get panelInsight(): { message: string; ctaLabel: string } | null {
    if (!this.configComplete && !this.esGratis) {
      return {
        message: 'Configura una cuenta Wompi para comenzar a vender.',
        ctaLabel: '',
      };
    }
    return null;
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

  onEsGratisChange(gratis: boolean): void {
    if (gratis) {
      this.wompiCuentaId = null;
      this.porcentajeServicio = 0;
    }
    this.onFormChange();
  }

  closePanel(): void {
    void this.drawerRef.close({ changed: false });
  }

  async save(): Promise<void> {
    if (this.saving || !this.isDirty()) {
      return;
    }

    const porcentajeServicio = Number(this.porcentajeServicio ?? 0);
    if (!this.esGratis && (!Number.isFinite(porcentajeServicio) || porcentajeServicio < 0 || porcentajeServicio > 100)) {
      this.alertService.warning('Porcentaje inválido', 'El porcentaje de servicio debe estar entre 0 y 100');
      return;
    }

    if (!this.isShowcaseMode && !this.esGratis && !this.wompiCuentaId) {
      this.alertService.warning('Campo requerido', 'La cuenta Wompi es requerida para eventos de pago');
      return;
    }

    this.saving = true;
    this.cdr.detectChanges();

    try {
      const payload = {
        es_gratis: this.esGratis,
        porcentaje_servicio: this.esGratis ? 0 : porcentajeServicio,
        wompi_cuenta_id: this.isShowcaseMode ? null : (this.wompiCuentaId ?? null),
      };

      const updated = await this.eventosService.updateEvento(this.data.eventoId, payload);

      this.captureSnapshot();
      this.alertService.success('Guardado', 'La configuración de cobros se guardó correctamente.');
      this.drawerRef.markPristine();
      void this.drawerRef.close({
        changed: true,
        es_gratis: updated.es_gratis ?? this.esGratis,
        porcentaje_servicio: updated.porcentaje_servicio ?? payload.porcentaje_servicio,
        wompi_cuenta_id: updated.wompi_cuenta_id ?? payload.wompi_cuenta_id,
      });
    } catch (err) {
      console.error('Error guardando cobros del evento:', err);
      this.alertService.error('Error', 'No se pudo guardar la configuración de cobros.');
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  private async loadWompiCuentas(): Promise<void> {
    this.drawerRef.setLoading(true);
    try {
      this.wompiCuentas = await this.wompiCuentasService.getCuentasActivas();
      this.wompiCuentaOptions = mapToEvSelectOptions(
        this.wompiCuentas,
        (c) => `${c.nombre} (ID ${c.id})`,
        (c) => c.id,
      );
    } catch (err) {
      console.error('Error cargando cuentas Wompi:', err);
      this.alertService.error('Error', 'No se pudieron cargar las cuentas Wompi');
      this.wompiCuentas = [];
      this.wompiCuentaOptions = [];
    } finally {
      this.drawerRef.setLoading(false);
      this.cdr.detectChanges();
    }
  }

  private captureSnapshot(): void {
    this.initialSnapshot = JSON.stringify(this.getFormSnapshot());
  }

  private getFormSnapshot(): CobrosFormSnapshot {
    return {
      esGratis: this.esGratis,
      porcentajeServicio: Number(this.porcentajeServicio ?? 0),
      wompiCuentaId: this.wompiCuentaId,
    };
  }

  private isDirty(): boolean {
    return JSON.stringify(this.getFormSnapshot()) !== this.initialSnapshot;
  }
}
