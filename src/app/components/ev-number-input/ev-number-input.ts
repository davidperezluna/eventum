import { CommonModule } from '@angular/common';
import {
  Component,
  HostBinding,
  Input,
  booleanAttribute,
  forwardRef,
  numberAttribute,
} from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import {
  extractDigits,
  formatGroupedDigits,
  formatGroupedNumber,
  parseGroupedNumber,
  roundToDecimals,
} from '../../core/number-input-format';

let evNumberInputIdCounter = 0;

@Component({
  selector: 'ev-number-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <input
      [id]="inputId"
      type="text"
      [class]="inputClass"
      [attr.inputmode]="allowDecimals ? 'decimal' : 'numeric'"
      [attr.autocomplete]="autocomplete"
      [placeholder]="placeholder"
      [disabled]="isDisabled"
      [value]="displayValue"
      (focus)="onFocus()"
      (blur)="onBlur()"
      (input)="onInput($event)"
    />
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      min-width: 0;
    }

    :host(.ev-number-input--full) input {
      width: 100%;
    }
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => EvNumberInput),
      multi: true,
    },
  ],
})
export class EvNumberInput implements ControlValueAccessor {
  @Input() id?: string;
  @Input() inputClass = 'ev-input';
  @Input() placeholder = '';
  @Input() autocomplete = 'off';
  @Input({ transform: booleanAttribute }) fullWidth = true;
  @Input({ transform: booleanAttribute }) disabled = false;

  /** Entero (cantidades / dinero sin centavos) o decimal (precios con centavos). */
  @Input() mode: 'integer' | 'decimal' = 'integer';

  @Input({ transform: numberAttribute }) min?: number;
  @Input({ transform: numberAttribute }) max?: number;
  @Input({ transform: numberAttribute }) decimals = 0;

  @HostBinding('class.ev-number-input--full')
  get hostFullWidth(): boolean {
    return this.fullWidth;
  }

  displayValue = '';
  isDisabled = false;

  private modelValue: number | null = null;
  private focused = false;
  private readonly fallbackId = `ev-number-input-${++evNumberInputIdCounter}`;

  private onChange: (value: number | null) => void = () => {};
  private onTouched: () => void = () => {};

  get inputId(): string {
    return this.id ?? this.fallbackId;
  }

  get allowDecimals(): boolean {
    return this.mode === 'decimal' && this.decimals > 0;
  }

  writeValue(value: number | null | undefined): void {
    this.modelValue = value == null || !Number.isFinite(Number(value)) ? null : Number(value);
    if (!this.focused) {
      this.displayValue = this.formatModel(this.modelValue);
    }
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled = isDisabled;
  }

  onFocus(): void {
    this.focused = true;
    if (this.modelValue == null) {
      this.displayValue = '';
      return;
    }
    if (this.allowDecimals) {
      this.displayValue = String(this.modelValue).replace('.', ',');
    } else {
      this.displayValue = String(Math.trunc(this.modelValue));
    }
  }

  onBlur(): void {
    this.focused = false;
    this.onTouched();
    this.modelValue = this.clamp(this.modelValue);
    this.onChange(this.modelValue);
    this.displayValue = this.formatModel(this.modelValue);
  }

  onInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;

    if (!this.allowDecimals) {
      const digits = extractDigits(raw);
      this.displayValue = formatGroupedDigits(digits);
      this.modelValue = digits ? Number(digits) : null;
      this.onChange(this.modelValue);
      return;
    }

    this.displayValue = raw;
    this.modelValue = parseGroupedNumber(raw, true);
    if (this.modelValue != null) {
      this.modelValue = roundToDecimals(this.modelValue, this.decimals);
    }
    this.onChange(this.modelValue);
  }

  private formatModel(value: number | null): string {
    if (value == null) {
      return '';
    }
    return formatGroupedNumber(value, {
      maxDecimals: this.allowDecimals ? this.decimals : 0,
      minDecimals: 0,
    });
  }

  private clamp(value: number | null): number | null {
    if (value == null) {
      return null;
    }
    let next = this.allowDecimals ? roundToDecimals(value, this.decimals) : Math.trunc(value);
    if (this.min != null && next < this.min) {
      next = this.min;
    }
    if (this.max != null && next > this.max) {
      next = this.max;
    }
    return next;
  }
}
