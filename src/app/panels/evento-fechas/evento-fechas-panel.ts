import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DrawerRef, EV_DRAWER_DATA, EvDrawerContent } from '../../core/drawer';
import { EventosService } from '../../services/eventos.service';
import { TimezoneService } from '../../services/timezone.service';
import { AlertService } from '../../services/alert.service';
import { EvDrawerFooter } from '../../components/ev-drawer/ev-drawer-footer';
import { EvButton } from '../../components/ev-button';
import { EvNumberInput } from '../../components/ev-number-input/ev-number-input';
import { EvDatetimePeriod } from '../../components/ev-datetime-period/ev-datetime-period';
import { EvFormSection } from '../../components/ev-form-section/ev-form-section';
import { EvNotice } from '../../components/ev-notice';
import { EvPanelForm } from '../../components/ev-panel-form';
import { Evento } from '../../types';
import { getRangeValidationMessage } from '../../core/datetime-picker';
import {
  EventoFechasDrawerResult,
  EventoFechasPanelData,
  FechasFormSnapshot,
} from './evento-fechas.types';

@Component({
  selector: 'app-evento-fechas-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    EvDrawerFooter,
    EvButton,
    EvNumberInput,
    EvDatetimePeriod,
    EvFormSection,
    EvNotice,
    EvPanelForm,
  ],
  templateUrl: './evento-fechas-panel.html',
  styleUrl: './evento-fechas-panel.css',
})
export class EventoFechasPanel implements OnInit, EvDrawerContent {
  private readonly eventosService = inject(EventosService);
  private readonly timezoneService = inject(TimezoneService);
  private readonly alertService = inject(AlertService);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly drawerRef = inject(DrawerRef<EventoFechasDrawerResult>);
  readonly data = inject<EventoFechasPanelData>(EV_DRAWER_DATA);

  edadMinima: number | null = null;
  fechaInicio = '';
  fechaFin = '';
  fechaVentaInicio = '';
  fechaVentaFin = '';

  saving = false;
  private initialSnapshot = '';

  ngOnInit(): void {
    this.edadMinima = this.data.edad_minima ?? null;
    this.fechaInicio = this.toDatetimeLocal(this.data.fecha_inicio);
    this.fechaFin = this.toDatetimeLocal(this.data.fecha_fin);
    this.fechaVentaInicio = this.toDatetimeLocal(this.data.fecha_venta_inicio);
    this.fechaVentaFin = this.toDatetimeLocal(this.data.fecha_venta_fin);
    this.captureSnapshot();
  }

  get configComplete(): boolean {
    return !!(this.fechaInicio && this.fechaFin && this.fechaVentaInicio && this.fechaVentaFin);
  }

  get panelInsight(): { message: string; ctaLabel: string } | null {
    if (!this.configComplete) {
      return {
        message: 'Define las fechas del evento y del periodo de venta para comenzar a vender entradas.',
        ctaLabel: '',
      };
    }
    return null;
  }

  get hasRangeErrors(): boolean {
    return !!(this.eventRangeError || this.saleRangeError);
  }

  get eventRangeError(): string | null {
    return getRangeValidationMessage(this.fechaInicio, this.fechaFin);
  }

  get saleRangeError(): string | null {
    return getRangeValidationMessage(this.fechaVentaInicio, this.fechaVentaFin);
  }

  get canSave(): boolean {
    return this.isDirty() && this.configComplete && !this.hasRangeErrors;
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
        edad_minima: this.edadMinima ?? undefined,
        fecha_inicio: this.timezoneService.datetimeLocalToISO(this.fechaInicio),
        fecha_fin: this.timezoneService.datetimeLocalToISO(this.fechaFin),
        fecha_venta_inicio: this.timezoneService.datetimeLocalToISO(this.fechaVentaInicio),
        fecha_venta_fin: this.timezoneService.datetimeLocalToISO(this.fechaVentaFin),
      };

      const updated = await this.eventosService.updateEvento(this.data.eventoId, payload);

      this.captureSnapshot();
      this.alertService.success('Guardado', 'Las fechas del evento se guardaron correctamente.');
      this.drawerRef.markPristine();

      void this.drawerRef.close({
        changed: true,
        edad_minima: updated.edad_minima ?? this.edadMinima,
        fecha_inicio: updated.fecha_inicio,
        fecha_fin: updated.fecha_fin,
        fecha_venta_inicio: updated.fecha_venta_inicio,
        fecha_venta_fin: updated.fecha_venta_fin,
      });
    } catch (err) {
      console.error('Error guardando fechas del evento:', err);
      this.alertService.error('Error', 'No se pudieron guardar las fechas del evento.');
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  private validate(): boolean {
    if (!this.fechaInicio || !this.fechaFin) {
      this.alertService.warning('Campo requerido', 'Las fechas de inicio y fin del evento son requeridas.');
      return false;
    }
    if (!this.fechaVentaInicio || !this.fechaVentaFin) {
      this.alertService.warning('Campo requerido', 'Las fechas de venta son requeridas.');
      return false;
    }
    const eventError = this.eventRangeError;
    if (eventError) {
      this.alertService.warning('Fechas inválidas', eventError);
      return false;
    }
    const saleError = this.saleRangeError;
    if (saleError) {
      this.alertService.warning('Fechas de venta inválidas', saleError);
      return false;
    }
    return true;
  }

  private toDatetimeLocal(value?: Date | string | null): string {
    if (!value) {
      return '';
    }
    const iso = typeof value === 'string' ? value : value.toISOString();
    return this.timezoneService.isoToDatetimeLocal(iso);
  }

  private captureSnapshot(): void {
    this.initialSnapshot = JSON.stringify(this.getFormSnapshot());
  }

  private getFormSnapshot(): FechasFormSnapshot {
    return {
      edad_minima: this.edadMinima,
      fecha_inicio: this.fechaInicio,
      fecha_fin: this.fechaFin,
      fecha_venta_inicio: this.fechaVentaInicio,
      fecha_venta_fin: this.fechaVentaFin,
    };
  }

  private isDirty(): boolean {
    return JSON.stringify(this.getFormSnapshot()) !== this.initialSnapshot;
  }
}
