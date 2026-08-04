import { Component, EventEmitter, forwardRef, Input, Output } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import {
  INDICATIVO_TELEFONO_COLOMBIA,
  normalizarTelefonoColombia,
} from '../../core/telefono-colombia';

@Component({
  selector: 'app-telefono-colombia-input',
  templateUrl: './telefono-colombia-input.html',
  styleUrl: './telefono-colombia-input.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TelefonoColombiaInputComponent),
      multi: true,
    },
  ],
})
export class TelefonoColombiaInputComponent implements ControlValueAccessor {
  @Input() inputId = '';
  @Input() name = 'telefono';
  @Input() placeholder = '300 123 4567';
  @Input() describedBy = '';
  @Input() hasError = false;
  @Input() disabled = false;
  @Output() blurred = new EventEmitter<void>();

  readonly indicativo = INDICATIVO_TELEFONO_COLOMBIA;
  value = '';

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    this.value = normalizarTelefonoColombia(String(value ?? ''));
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.value = target.value;
    this.onChange(this.value);
  }

  onBlur(): void {
    this.onTouched();
    this.blurred.emit();
  }
}
