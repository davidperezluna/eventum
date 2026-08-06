import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { DateFormatPipe } from '../../pipes/date-format.pipe';
import { CategoriaEvento, Evento, Lugar } from '../../types';

@Component({
  selector: 'ev-evento-preview',
  standalone: true,
  imports: [CommonModule, DateFormatPipe],
  templateUrl: './ev-evento-preview.html',
  styleUrl: './ev-evento-preview.css',
})
export class EvEventoPreview {
  @Input() formData: Partial<Evento> = {};
  @Input() previewUrl: string | null = null;
  @Input() categorias: CategoriaEvento[] = [];
  @Input() lugares: Lugar[] = [];
  @Input() estadoLabel = 'Borrador';

  get titulo(): string {
    return this.formData.titulo?.trim() || 'Tu evento';
  }

  get categoriaNombre(): string {
    const id = this.formData.categoria_id;
    if (!id) return 'Sin categoría';
    return this.categorias.find((c) => c.id === id)?.nombre ?? 'Categoría';
  }

  get lugarNombre(): string {
    const id = this.formData.lugar_id;
    if (!id) return 'Sin lugar';
    const lugar = this.lugares.find((l) => l.id === id);
    if (!lugar) return 'Sin lugar';
    return lugar.ciudad ? `${lugar.nombre}, ${lugar.ciudad}` : lugar.nombre;
  }

  get descripcionCorta(): string {
    return this.formData.descripcion_corta?.trim() || 'La descripción corta aparecerá en listados y tarjetas.';
  }

  get precioLabel(): string {
    if (this.formData.es_gratis) return 'Entrada gratis';
    if (this.formData.precio_minimo != null && this.formData.precio_minimo > 0) {
      return `Desde $${this.formatNumber(this.formData.precio_minimo)}`;
    }
    return 'Precio por definir';
  }

  get hasFechaEvento(): boolean {
    return !!this.formData.fecha_inicio;
  }

  get hasFechaVenta(): boolean {
    return !!this.formData.fecha_venta_inicio;
  }

  get showPlaceholder(): boolean {
    return !this.previewUrl;
  }

  get iniciales(): string {
    const words = this.titulo.split(/\s+/).filter(Boolean);
    if (words.length === 0 || this.titulo === 'Tu evento') return 'EV';
    return words
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('');
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value);
  }
}
