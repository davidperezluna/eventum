import { BreakpointObserver } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostBinding,
  Input,
  OnDestroy,
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
const EV_SELECT_MOBILE_QUERY = '(max-width: 640px)';

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
export class EvSelect implements ControlValueAccessor, AfterViewInit, OnDestroy {
  @ViewChild(NgSelectComponent) private ngSelect?: NgSelectComponent;

  @Input() placeholder = 'Seleccionar';
  @Input() searchable: EvSelectSearchMode = 'auto';
  @Input({ transform: numberAttribute }) searchThreshold = 8;
  @Input({ transform: booleanAttribute }) clearable = false;
  @Input({ transform: booleanAttribute }) disabled = false;
  @Input({ transform: booleanAttribute }) hasError = false;
  @Input({ transform: booleanAttribute }) fullWidth = false;
  /** Fuerza bottom sheet en móvil (auto en viewport ≤640px). */
  @Input({ transform: booleanAttribute }) mobileSheet?: boolean;
  @Input() id?: string;
  @Input() ariaLabel?: string;
  @Input() mobileSheetTitle?: string;
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
  private mobilePanelEl: HTMLElement | null = null;
  private mobileHeadEl: HTMLElement | null = null;
  private mobileCloseHandler: (() => void) | null = null;

  constructor(
    private readonly cdr: ChangeDetectorRef,
    private readonly breakpointObserver: BreakpointObserver,
  ) {}

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

  get isMobileSheet(): boolean {
    if (this.mobileSheet !== undefined) return this.mobileSheet;
    return this.breakpointObserver.isMatched(EV_SELECT_MOBILE_QUERY);
  }

  get sheetTitle(): string {
    return this.mobileSheetTitle ?? this.ariaLabel ?? this.placeholder;
  }

  get hostClass(): string {
    return [
      'ev-select-host',
      `ev-select-host--${this.size}`,
      `ev-select-host--${this.variant}`,
      this.isOpen ? 'ev-select-host--open' : '',
      this.disabled ? 'ev-select-host--disabled' : '',
      this.hasError ? 'ev-select-host--error' : '',
      this.fullWidth ? 'ev-select-host--full' : '',
      this.isMobileSheet && this.isOpen ? 'ev-select-host--sheet-open' : '',
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

  ngOnDestroy(): void {
    this.cleanupMobilePanel();
    this.unlockBodyScroll();
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
    if (this.isMobileSheet) {
      this.lockBodyScroll();
    }
    this.schedulePanelDecoration();
    this.cdr.markForCheck();
  }

  onClose(): void {
    this.isOpen = false;
    this.cleanupMobilePanel();
    this.unlockBodyScroll();
    this.onTouched();
    this.cdr.markForCheck();
  }

  closePanel(): void {
    this.ngSelect?.close();
  }

  private schedulePanelDecoration(retry = 0): void {
    requestAnimationFrame(() => {
      const panel = this.getOpenPanel();
      if (!panel) {
        if (retry < 4) {
          this.schedulePanelDecoration(retry + 1);
        }
        return;
      }
      this.decoratePanel(panel);
    });
  }

  private decoratePanel(panel: HTMLElement): void {
    this.cleanupMobilePanel();
    this.mobilePanelEl = panel;
    panel.classList.add('ev-select-panel');

    if (!this.isMobileSheet) {
      return;
    }

    panel.classList.add('ev-select-panel--sheet');

    if (panel.querySelector('.ev-select-sheet-head')) {
      return;
    }

    const head = document.createElement('div');
    head.className = 'ev-select-sheet-head';
    head.innerHTML = `
      <span class="ev-select-sheet-head__handle" aria-hidden="true"></span>
      <p class="ev-select-sheet-head__title">${this.escapeHtml(this.sheetTitle)}</p>
      <button type="button" class="ev-select-sheet-head__close" aria-label="Cerrar">
        <span class="material-icons" aria-hidden="true">close</span>
      </button>
    `;

    const closeBtn = head.querySelector('.ev-select-sheet-head__close');
    this.mobileCloseHandler = () => this.closePanel();
    closeBtn?.addEventListener('click', this.mobileCloseHandler);

    panel.insertBefore(head, panel.firstChild);
    this.mobileHeadEl = head;
  }

  private cleanupMobilePanel(): void {
    if (this.mobileCloseHandler && this.mobileHeadEl) {
      this.mobileHeadEl
        .querySelector('.ev-select-sheet-head__close')
        ?.removeEventListener('click', this.mobileCloseHandler);
    }

    this.mobilePanelEl?.classList.remove('ev-select-panel', 'ev-select-panel--sheet');
    this.mobileHeadEl?.remove();
    this.mobilePanelEl = null;
    this.mobileHeadEl = null;
    this.mobileCloseHandler = null;
  }

  private getOpenPanel(): HTMLElement | null {
    const panels = Array.from(document.querySelectorAll('body > .ng-dropdown-panel'));
    const visible = panels.find((panel) => {
      const el = panel as HTMLElement;
      return el.offsetParent !== null || getComputedStyle(el).display !== 'none';
    });
    return (visible ?? panels.at(-1) ?? null) as HTMLElement | null;
  }

  private lockBodyScroll(): void {
    document.body.style.overflow = 'hidden';
  }

  private unlockBodyScroll(): void {
    document.body.style.overflow = '';
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
