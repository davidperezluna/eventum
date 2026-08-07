import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DrawerRef, EV_DRAWER_DATA, EvDrawerContent } from '../../core/drawer';
import { EventosService } from '../../services/eventos.service';
import { LugaresService } from '../../services/lugares.service';
import { TimezoneService } from '../../services/timezone.service';
import { AlertService } from '../../services/alert.service';
import { EvDrawerFooter } from '../../components/ev-drawer/ev-drawer-footer';
import { EvButton } from '../../components/ev-button';
import { EvSelect, EvSelectOption, mapToEvSelectOptions } from '../../components/ev-select/ev-select';
import { EvNumberInput } from '../../components/ev-number-input/ev-number-input';
import { EvDatetimePeriod } from '../../components/ev-datetime-period/ev-datetime-period';
import { EvFormSection } from '../../components/ev-form-section/ev-form-section';
import { EvNotice } from '../../components/ev-notice';
import { EvPanelForm } from '../../components/ev-panel-form';
import { Lugar, Evento } from '../../types';
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
    EvSelect,
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
  private readonly lugaresService = inject(LugaresService);
  private readonly timezoneService = inject(TimezoneService);
  private readonly alertService = inject(AlertService);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly drawerRef = inject(DrawerRef<EventoFechasDrawerResult>);
  readonly data = inject<EventoFechasPanelData>(EV_DRAWER_DATA);

  lugares: Lugar[] = [];
  lugarOptions: EvSelectOption<number>[] = [];

  lugarId: number | null = null;
  edadMinima: number | null = null;
  fechaInicio = '';
  fechaFin = '';
  fechaVentaInicio = '';
  fechaVentaFin = '';

  saving = false;
  private initialSnapshot = '';

  ngOnInit(): void {
    this.lugarId = this.data.lugar_id ?? null;
    this.edadMinima = this.data.edad_minima ?? null;
    this.fechaInicio = this.toDatetimeLocal(this.data.fecha_inicio);
    this.fechaFin = this.toDatetimeLocal(this.data.fecha_fin);
    this.fechaVentaInicio = this.toDatetimeLocal(this.data.fecha_venta_inicio);
    this.fechaVentaFin = this.toDatetimeLocal(this.data.fecha_venta_fin);
    this.captureSnapshot();
    void this.loadLugares();
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
    if (this.lugarId == null) {
      return {
        message: 'Asignar un lugar ayuda a tus asistentes a encontrar el evento con facilidad.',
        ctaLabel: '',
      };
    }
    return null;
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
        lugar_id: this.lugarId ?? undefined,
        edad_minima: this.edadMinima ?? undefined,
        fecha_inicio: this.timezoneService.datetimeLocalToISO(this.fechaInicio),
        fecha_fin: this.timezoneService.datetimeLocalToISO(this.fechaFin),
        fecha_venta_inicio: this.timezoneService.datetimeLocalToISO(this.fechaVentaInicio),
        fecha_venta_fin: this.timezoneService.datetimeLocalToISO(this.fechaVentaFin),
      };

      const updated = await this.eventosService.updateEvento(this.data.eventoId, payload);

      this.captureSnapshot();
      this.alertService.success('Guardado', 'Las fechas y el lugar se guardaron correctamente.');
      this.drawerRef.markPristine();

      const lugar =
        updated.lugar ??
        (this.lugarId != null
          ? this.lugares.find((l) => l.id === this.lugarId) ?? this.data.lugar ?? null
          : null);

      void this.drawerRef.close({
        changed: true,
        lugar_id: updated.lugar_id ?? this.lugarId,
        edad_minima: updated.edad_minima ?? this.edadMinima,
        fecha_inicio: updated.fecha_inicio,
        fecha_fin: updated.fecha_fin,
        fecha_venta_inicio: updated.fecha_venta_inicio,
        fecha_venta_fin: updated.fecha_venta_fin,
        lugar: lugar ? { id: lugar.id, nombre: lugar.nombre, ciudad: lugar.ciudad } : null,
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
    return true;
  }

  private async loadLugares(): Promise<void> {
    this.drawerRef.setLoading(true);
    try {
      const response = await this.lugaresService.getLugares({ limit: 1000 });
      this.lugares = response.data ?? [];
      this.lugarOptions = mapToEvSelectOptions(
        this.lugares,
        (l) => `${l.nombre} — ${l.ciudad}`,
        (l) => l.id,
      );
    } catch (err) {
      console.error('Error cargando lugares:', err);
      this.alertService.error('Error', 'No se pudieron cargar los lugares.');
      this.lugares = [];
      this.lugarOptions = [];
    } finally {
      this.drawerRef.setLoading(false);
      this.cdr.detectChanges();
    }
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
      lugar_id: this.lugarId,
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
