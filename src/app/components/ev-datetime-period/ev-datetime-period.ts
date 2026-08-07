import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  Output,
  booleanAttribute,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getRangeValidationMessage, coerceToDatetimeLocalString } from '../../core/datetime-picker';
import { EvDateTimePicker } from '../ev-date-time-picker/ev-date-time-picker';

@Component({
  selector: 'ev-datetime-period',
  standalone: true,
  imports: [CommonModule, FormsModule, EvDateTimePicker],
  templateUrl: './ev-datetime-period.html',
  styleUrl: './ev-datetime-period.css',
})
export class EvDatetimePeriod {
  @Input() startLabel = 'Inicia';
  @Input() endLabel = 'Termina';
  @Input() start: string | Date | null | undefined = '';
  @Input() end: string | Date | null | undefined = '';
  @Input({ transform: booleanAttribute }) disabled = false;
  @Input({ transform: booleanAttribute }) required = false;
  @Input() startId = '';
  @Input() endId = '';

  @Output() startChange = new EventEmitter<string>();
  @Output() endChange = new EventEmitter<string>();

  get rangeError(): string | null {
    return getRangeValidationMessage(this.start, this.end);
  }

  get normalizedStart(): string {
    return coerceToDatetimeLocalString(this.start);
  }

  get normalizedEnd(): string {
    return coerceToDatetimeLocalString(this.end);
  }

  get hasRangeError(): boolean {
    return !!this.rangeError;
  }

  onStartChange(value: string): void {
    this.startChange.emit(value);
  }

  onEndChange(value: string): void {
    this.endChange.emit(value);
  }
}
