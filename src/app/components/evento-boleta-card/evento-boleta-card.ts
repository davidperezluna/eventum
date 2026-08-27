import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TipoBoleta } from '../../types';

@Component({
  selector: 'app-evento-boleta-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './evento-boleta-card.html',
  styleUrl: './evento-boleta-card.css',
})
export class EventoBoletaCard {
  @Input({ required: true }) tipo!: TipoBoleta;
  @Input() cantidad = 0;
  @Input() maxCantidad = 0;
  @Input() agotada = false;
  @Input() mostrarDescripcion = true;
  @Input() mostrarEstado = false;
  @Input() estado = '';
  @Input() mostrarEliminar = true;
  @Output() aumentar = new EventEmitter<void>();
  @Output() disminuir = new EventEmitter<void>();
  @Output() eliminar = new EventEmitter<void>();

  get puedeAumentar(): boolean {
    return !this.agotada && (this.maxCantidad <= 0 || this.cantidad < this.maxCantidad);
  }

  get mostrarDescripcionReal(): boolean {
    const descripcion = (this.tipo?.descripcion || '').trim();
    const nombre = (this.tipo?.nombre || '').trim();
    return this.mostrarDescripcion && !!descripcion && descripcion.localeCompare(nombre, 'es', { sensitivity: 'accent' }) !== 0;
  }
}
