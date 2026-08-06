import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostBinding,
  Input,
  Output,
  ViewChild,
  forwardRef,
  booleanAttribute,
  numberAttribute,
} from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { NgOptionTemplateDirective, NgSelectComponent } from '@ng-select/ng-select';
import {
  EvSelectOption,
  EvSelectSearchMode,
  EvSelectSize,
  EvSelectVariant,
} from './ev-select.types';

let evSelectIdCounter = 0;

@Component({
  selector: 'ev-select',
  standalone: true,
  imports: [CommonModule, FormsModule, NgSelectComponent, NgOptionTemplateDirective],
  templateUrl: './ev-select.html',
  styleUrl: './ev-select.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => EvSelect),
      multi: true,
    },
  ],
})
export class EvSelect implements ControlValueAccessor, AfterViewInit {
  @ViewChild(NgSelectComponent) private ngSelect?: NgSelectComponent;

  @Input() placeholder = 'Seleccionar';
  @Input() searchable: EvSelectSearchMode = 'auto';
  @Input({ transform: numberAttribute }) searchThreshold = 8;
  @Input({ transform: booleanAttribute }) clearable = false;
  @Input({ transform: booleanAttribute }) disabled = false;
  @Input({ transform: booleanAttribute }) fullWidth = false;
  @Input() id?: string;
  @Input() ariaLabel?: string;
  @Input() size: EvSelectSize = 'md';
  @Input() variant: EvSelectVariant = 'form';
  @Input() appendTo: string | null = 'body';
  @Input() notFoundText = 'Sin resultados';
  @Input() searchPlaceholder = 'Buscar…';

  @Output() selectionChange = new EventEmitter<unknown>();

  @Input()
  set options(value: EvSelectOption[] | null | undefined) {
    this.optionsSnapshot = value ?? [];
    this.applyValue(this.currentValue);
  }
  get options(): EvSelectOption[] {
    return this.optionsSnapshot;
  }

  isOpen = false;

  readonly trackByOption = (item: EvSelectOption) => item?.value;

  currentValue: unknown = null;

  private optionsSnapshot: EvSelectOption[] = [];
  private readonly fallbackId = `ev-select-${++evSelectIdCounter}`;
  private suppressModelChange = false;

  constructor(private readonly cdr: ChangeDetectorRef) {}

  get inputId(): string {
    return this.id ?? this.fallbackId;
  }

  get isSearchable(): boolean {
    if (this.searchable === true) {
      return true;
    }
    if (this.searchable === false) {
      return false;
    }
    return this.optionsSnapshot.length >= this.searchThreshold;
  }

  get hostClass(): string {
    return [
      'ev-select-host',
      `ev-select-host--${this.size}`,
      `ev-select-host--${this.variant}`,
      this.isOpen ? 'ev-select-host--open' : '',
      this.disabled ? 'ev-select-host--disabled' : '',
      this.fullWidth ? 'ev-select-host--full' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  @HostBinding('class')
  get hostClasses(): string {
    return this.hostClass;
  }

  private onChange: (value: unknown) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  ngAfterViewInit(): void {
    this.applyValue(this.currentValue);
    this.ngSelect?.setDisabledState(this.disabled);
  }

  writeValue(value: unknown): void {
    this.applyValue(value);
  }

  registerOnChange(fn: (value: unknown) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.ngSelect?.setDisabledState(isDisabled);
    this.cdr.markForCheck();
  }

  isSelectedOption(option: EvSelectOption | null | undefined): boolean {
    if (!option) {
      return false;
    }
    return this.valuesEqual(this.currentValue, option.value);
  }

  onModelChange(raw: unknown): void {
    if (this.suppressModelChange) {
      return;
    }
    const next = this.extractValue(raw);
    if (this.valuesEqual(next, this.currentValue)) {
      return;
    }
    this.currentValue = next;
    this.onChange(next);
    this.selectionChange.emit(next);
    this.cdr.markForCheck();
  }

  onClearSelection(): void {
    this.currentValue = null;
    this.onChange(null);
    this.selectionChange.emit(null);
    this.cdr.markForCheck();
  }

  onBlur(): void {
    this.onTouched();
  }

  onOpen(): void {
    this.isOpen = true;
  }

  onClose(): void {
    this.isOpen = false;
    this.onTouched();
  }

  private applyValue(value: unknown): void {
    this.currentValue = this.coerceToOptionValue(value);
    this.cdr.markForCheck();
    queueMicrotask(() => setTimeout(() => this.syncNgSelect(), 0));
  }

  private syncNgSelect(): void {
    if (!this.ngSelect) {
      return;
    }
    this.suppressModelChange = true;
    this.ngSelect.writeValue(this.currentValue);
    this.suppressModelChange = false;
    this.cdr.detectChanges();
  }

  private coerceToOptionValue(value: unknown): unknown {
    if (value == null || value === '') {
      return null;
    }
    const match = this.optionsSnapshot.find((option) => this.valuesEqual(option.value, value));
    return match ? match.value : value;
  }

  private valuesEqual(a: unknown, b: unknown): boolean {
    if (a == null && b == null) {
      return true;
    }
    if (a == null || b == null) {
      return false;
    }
    return Object.is(a, b) || String(a) === String(b);
  }

  private extractValue(raw: unknown): unknown {
    if (raw && typeof raw === 'object' && 'value' in (raw as EvSelectOption)) {
      return (raw as EvSelectOption).value;
    }
    return raw ?? null;
  }
}

export type { EvSelectOption, EvSelectSearchMode, EvSelectSize, EvSelectVariant } from './ev-select.types';
export { mapToEvSelectOptions, withEvSelectPlaceholder } from './ev-select.utils';
