import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';

export type AccesoPuertaToastTipo = 'entrada' | 'producto' | 'cover' | 'cover-salida';

export interface AccesoPuertaToastProducto {
  nombre: string;
  cantidad: number;
}

@Component({
  selector: 'app-acceso-puerta-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './acceso-puerta-toast.html',
  styleUrl: './acceso-puerta-toast.css',
})
export class AccesoPuertaToastComponent implements OnChanges, OnDestroy {
  @Input() visible = false;
  @Input() tipo: AccesoPuertaToastTipo = 'entrada';
  @Input() titulo = '';
  @Input() detalle = '';
  @Input() contextoLabel = '';
  @Input() contextoValor = '';
  @Input() referenciaLabel = '';
  @Input() referenciaValor = '';
  @Input() productos: AccesoPuertaToastProducto[] = [];
  @Input() autoCloseMs = 2800;
  @Input() actionLabel = '';

  @Output() closed = new EventEmitter<void>();
  @Output() action = new EventEmitter<void>();

  private autoCloseTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']) {
      if (this.visible) {
        this.programarAutoCierre();
      } else {
        this.cancelarAutoCierre();
      }
    }
    if (this.visible && (changes['actionLabel'] || changes['autoCloseMs'])) {
      this.programarAutoCierre();
    }
  }

  ngOnDestroy(): void {
    this.cancelarAutoCierre();
  }

  get esSalida(): boolean {
    return this.tipo === 'cover-salida';
  }

  get kicker(): string {
    switch (this.tipo) {
      case 'cover-salida':
        return 'Salida registrada';
      case 'cover':
        return 'Entrada registrada';
      case 'producto':
        return 'Entrega OK';
      default:
        return 'Ingreso OK';
    }
  }

  get contextoEtiqueta(): string {
    if (this.contextoLabel.trim()) {
      return this.contextoLabel.trim();
    }
    if (this.tipo === 'cover' || this.tipo === 'cover-salida') {
      return 'Club';
    }
    if (this.tipo === 'entrada') {
      return 'Evento';
    }
    return '';
  }

  get referenciaEtiqueta(): string {
    if (this.referenciaLabel.trim()) {
      return this.referenciaLabel.trim();
    }
    if (this.tipo === 'cover' || this.tipo === 'cover-salida') {
      return 'Cover';
    }
    if (this.tipo === 'entrada') {
      return 'Entrada';
    }
    if (this.tipo === 'producto') {
      return 'Pedido';
    }
    return 'Referencia';
  }

  cerrar(): void {
    this.cancelarAutoCierre();
    this.closed.emit();
  }

  onAction(): void {
    this.cancelarAutoCierre();
    this.action.emit();
  }

  private programarAutoCierre(): void {
    this.cancelarAutoCierre();
    if (this.actionLabel.trim() || this.autoCloseMs <= 0) {
      return;
    }
    this.autoCloseTimer = setTimeout(() => {
      this.closed.emit();
    }, this.autoCloseMs);
  }

  private cancelarAutoCierre(): void {
    if (this.autoCloseTimer) {
      clearTimeout(this.autoCloseTimer);
      this.autoCloseTimer = null;
    }
  }
}
