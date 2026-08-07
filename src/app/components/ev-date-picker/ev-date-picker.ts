import { BreakpointObserver } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  Input,
  OnDestroy,
  ViewChild,
  booleanAttribute,
  forwardRef,
} from '@angular/core';
import {
  ControlValueAccessor,
  FormControl,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
} from '@angular/forms';
import {
  MatDatepicker,
  MatDatepickerInputEvent,
  MatDatepickerModule,
} from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input';
import { DateTime } from 'luxon';
import { Subscription } from 'rxjs';
import {
  formatDateDisplay,
  formatDateKey,
  parseDateOnly,
} from '../../core/datetime-picker';
import { EvCalendarHeader } from './ev-calendar-header';

let evDatePickerIdCounter = 0;
const EV_DATE_PICKER_MOBILE_QUERY = '(max-width: 640px)';

@Component({
  selector: 'ev-date-picker',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDatepickerModule, MatInputModule],
  templateUrl: './ev-date-picker.html',
  styleUrl: './ev-date-picker.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => EvDatePicker),
      multi: true,
    },
  ],
})
export class EvDatePicker implements ControlValueAccessor, OnDestroy {
  @ViewChild('picker') picker?: MatDatepicker<DateTime>;

  @Input() id?: string;
  @Input({ transform: booleanAttribute }) disabled = false;
  @Input({ transform: booleanAttribute }) hasError = false;
  /** Fuerza UI táctil full-screen (auto en viewport ≤640px). */
  @Input({ transform: booleanAttribute }) touchUi?: boolean;

  readonly dateCtrl = new FormControl<DateTime | null>(null);
  readonly calendarHeader = EvCalendarHeader;

  selectedKey = '';
  isDisabled = false;
  isOpen = false;
  isMobileViewport = false;

  private readonly fallbackId = `ev-date-picker-${++evDatePickerIdCounter}`;
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};
  private valueSub?: Subscription;
  private viewportSub?: Subscription;

  constructor(
    private readonly breakpointObserver: BreakpointObserver,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.isMobileViewport = this.breakpointObserver.isMatched(EV_DATE_PICKER_MOBILE_QUERY);
    this.viewportSub = this.breakpointObserver
      .observe(EV_DATE_PICKER_MOBILE_QUERY)
      .subscribe((state) => {
        this.isMobileViewport = state.matches;
      });
  }

  get inputId(): string {
    return this.id ?? this.fallbackId;
  }

  get inputDisabled(): boolean {
    return this.disabled || this.isDisabled;
  }

  get displayLabel(): string {
    return formatDateDisplay(this.selectedKey);
  }

  get isPlaceholder(): boolean {
    return !this.selectedKey;
  }

  get useTouchUi(): boolean {
    if (this.touchUi !== undefined) return this.touchUi;
    return this.breakpointObserver.isMatched(EV_DATE_PICKER_MOBILE_QUERY);
  }

  ngOnDestroy(): void {
    this.valueSub?.unsubscribe();
    this.viewportSub?.unsubscribe();
  }

  writeValue(value: string | null | undefined): void {
    this.selectedKey = value ?? '';
    const parsed = parseDateOnly(this.selectedKey);
    const luxonValue = parsed
      ? DateTime.fromObject({
          year: parsed.getFullYear(),
          month: parsed.getMonth() + 1,
          day: parsed.getDate(),
        })
      : null;
    this.dateCtrl.setValue(luxonValue, { emitEvent: false });
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
    this.valueSub?.unsubscribe();
    this.valueSub = this.dateCtrl.valueChanges.subscribe((value) => {
      this.applyLuxonValue(value);
    });
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled = isDisabled;
    if (isDisabled) {
      this.dateCtrl.disable({ emitEvent: false });
    } else {
      this.dateCtrl.enable({ emitEvent: false });
    }
  }

  openPicker(event: Event): void {
    event.stopPropagation();
    if (this.inputDisabled) return;
    // Actualiza [touchUi] antes de abrir (evita popup desktop en el primer tap móvil).
    this.cdr.detectChanges();
    this.picker?.open();
  }

  onPickerOpened(): void {
    this.isOpen = true;
  }

  onPickerClosed(): void {
    this.isOpen = false;
    this.onTouched();
  }

  onMatDateChange(event: MatDatepickerInputEvent<DateTime | null>): void {
    this.applyLuxonValue(event.value);
  }

  private applyLuxonValue(value: DateTime | null): void {
    const nextKey = value?.isValid ? formatDateKey(value.toJSDate()) : '';
    this.selectedKey = nextKey;
    if (this.dateCtrl.value !== value) {
      this.dateCtrl.setValue(value, { emitEvent: false });
    }
    this.onChange(nextKey);
  }
}
