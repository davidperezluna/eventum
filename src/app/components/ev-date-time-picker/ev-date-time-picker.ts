import { CommonModule } from '@angular/common';
import {
  Component,
  HostBinding,
  Input,
  booleanAttribute,
  forwardRef,
} from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { joinDatetimeLocal, splitDatetimeLocal } from '../../core/datetime-picker';
import { EvDatePicker } from '../ev-date-picker/ev-date-picker';
import { EvTimePicker } from '../ev-time-picker/ev-time-picker';

@Component({
  selector: 'ev-date-time-picker',
  standalone: true,
  imports: [CommonModule, FormsModule, EvDatePicker, EvTimePicker],
  templateUrl: './ev-date-time-picker.html',
  styleUrl: './ev-date-time-picker.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => EvDateTimePicker),
      multi: true,
    },
  ],
})
export class EvDateTimePicker implements ControlValueAccessor {
  @Input() id?: string;
  @Input({ transform: booleanAttribute }) fullWidth = true;
  @Input({ transform: booleanAttribute }) disabled = false;
  @Input({ transform: booleanAttribute }) hasError = false;

  datePart = '';
  timePart = '';
  isDisabled = false;

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  @HostBinding('class.ev-datetime-input--full')
  get hostFullWidth(): boolean {
    return this.fullWidth;
  }

  get inputDisabled(): boolean {
    return this.disabled || this.isDisabled;
  }

  get dateInputId(): string {
    return this.id ? `${this.id}-date` : undefined!;
  }

  get timeInputId(): string {
    return this.id ? `${this.id}-time` : undefined!;
  }

  writeValue(value: string | null | undefined): void {
    const { date, time } = splitDatetimeLocal(value);
    this.datePart = date;
    this.timePart = time;
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled = isDisabled;
  }

  onDateChange(date: string): void {
    this.datePart = date;
    this.emitValue();
    this.onTouched();
  }

  onTimeChange(time: string): void {
    this.timePart = time;
    this.emitValue();
    this.onTouched();
  }

  markTouched(): void {
    this.onTouched();
  }

  private emitValue(): void {
    this.onChange(joinDatetimeLocal(this.datePart, this.timePart));
  }
}