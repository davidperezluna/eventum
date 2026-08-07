import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { EvEventoCard } from '../ev-evento-card/ev-evento-card';
import { Evento, Lugar, TipoEstadoEvento } from '../../types';
import {
  getEventoEstadoCardLabel,
  getEventoEstadoCardStatusClass,
} from '../../core/evento-estado-labels';

@Component({
  selector: 'ev-evento-preview',
  standalone: true,
  imports: [CommonModule, EvEventoCard],
  templateUrl: './ev-evento-preview.html',
  styleUrl: './ev-evento-preview.css',
})
export class EvEventoPreview {
  @Input() formData: Partial<Evento> = {};
  @Input() previewUrl: string | null = null;
  @Input() lugares: Lugar[] = [];

  /** Preview del wizard: siempre como publicado (Entradas disponibles). */
  readonly previewEstado = TipoEstadoEvento.PUBLICADO;

  get showStatusBadge(): boolean {
    return true;
  }

  get cardEstadoLabel(): string {
    return getEventoEstadoCardLabel(this.previewEstado);
  }

  get titulo(): string {
    return this.formData.titulo?.trim() || 'Tu evento';
  }

  get isDefaultTitle(): boolean {
    return !this.formData.titulo?.trim();
  }

  get lugarLabel(): string {
    const id = this.formData.lugar_id;
    if (!id) return '';
    const lugar = this.lugares.find((l) => l.id === id);
    if (!lugar) return '';
    return lugar.ciudad?.trim() || lugar.nombre;
  }

  get precioLabel(): string {
    if (this.formData.es_gratis) return 'Gratis';
    if (this.formData.precio_minimo != null && this.formData.precio_minimo > 0) {
      return `Desde $${this.formatNumber(this.formData.precio_minimo)}`;
    }
    return '';
  }

  get fechaCorta(): string {
    if (!this.formData.fecha_inicio) return '';
    const date = this.toDate(this.formData.fecha_inicio);
    if (!date) return '';
    const formatted = new Intl.DateTimeFormat('es-CO', {
      day: 'numeric',
      month: 'short',
    }).format(date);
    return formatted.replace('.', '');
  }

  get metaLine(): string {
    return [this.fechaCorta, this.lugarLabel, this.precioLabel].filter(Boolean).join(' · ');
  }

  get statusClass(): string {
    return getEventoEstadoCardStatusClass(this.previewEstado);
  }

  get coverUrl(): string | null {
    return this.previewUrl ?? this.formData.imagen_principal ?? null;
  }

  get iniciales(): string {
    const words = this.titulo.split(/\s+/).filter(Boolean);
    if (words.length === 0 || this.isDefaultTitle) return 'EV';
    return words
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('');
  }

  private toDate(value: Date | string): Date | null {
    const date = typeof value === 'string' ? new Date(value) : value;
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value);
  }
}
