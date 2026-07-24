import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

export type QrAccesoModalVista = 'ready' | 'used' | 'blocked';

export interface QrAccesoModalRow {
  label: string;
  value: string;
}

export interface QrAccesoModalListSection {
  label: string;
  lines: string[];
  /** Lista más grande (p. ej. productos del pedido). */
  prominent?: boolean;
}

@Component({
  selector: 'app-qr-acceso-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './qr-acceso-modal.html',
  styleUrl: './qr-acceso-modal.css',
})
export class QrAccesoModalComponent {
  @Input() visible = false;
  @Input() vista: QrAccesoModalVista = 'ready';
  @Input() kicker = '';
  @Input() title = '';
  @Input() chip = '';
  @Input() blockedIcon: 'history' | 'payments' | 'shield' | 'schedule' = 'shield';
  @Input() blockedTitle = '';
  @Input() blockedMessage = '';
  @Input() blockedHint = '';
  @Input() qrUrl = '';
  @Input() loadingQr = false;
  @Input() rows: QrAccesoModalRow[] = [];
  @Input() listSection: QrAccesoModalListSection | null = null;
  @Input() secondaryActionLabel = '';
  @Input() secondaryActionIcon = '';

  @Output() closed = new EventEmitter<void>();
  @Output() secondaryAction = new EventEmitter<void>();

  onOverlayClick(): void {
    this.closed.emit();
  }

  onCloseClick(): void {
    this.closed.emit();
  }

  onSecondaryAction(): void {
    this.secondaryAction.emit();
  }
}
