import { CommonModule } from '@angular/common';
import {
  Component,
  HostBinding,
  Input,
  booleanAttribute,
  forwardRef,
} from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { EvDateTimePicker } from '../ev-date-time-picker/ev-date-time-picker';

/** @deprecated Usar `ev-date-time-picker`. Alias de compatibilidad. */
@Component({
  selector: 'ev-datetime-input',
  standalone: true,
  imports: [CommonModule, FormsModule, EvDateTimePicker],
  template: `
    <ev-date-time-picker
      [id]="id"
      [fullWidth]="fullWidth"
      [disabled]="inputDisabled"
      [hasError]="hasError"
      [ngModel]="value"
      (ngModelChange)="onInternalChange($event)"
    />
  `,
  styleUrl: './ev-datetime-input.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => EvDatetimeInput),
      multi: true,
    },
  ],
})
export class EvDatetimeInput implements ControlValueAccessor {
  @Input() id?: string;
  @Input({ transform: booleanAttribute }) fullWidth = true;
  @Input({ transform: booleanAttribute }) disabled = false;
  @Input({ transform: booleanAttribute }) hasError = false;

  value = '';
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

  writeValue(value: string | null | undefined): void {
    this.value = value ?? '';
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

  onInternalChange(value: string): void {
    this.value = value;
    this.onChange(value);
    this.onTouched();
  }
}
