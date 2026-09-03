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
  ElementRef,
  forwardRef,
  booleanAttribute,
  numberAttribute,
} from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { NgOptionTemplateDirective, NgSelectComponent } from '@ng-select/ng-select';
import { Subject, Subscription } from 'rxjs';
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
  /** Desactiva filtro local; emite términos para búsqueda en servidor vía typeahead. */
  @Input({ transform: booleanAttribute }) serverSideSearch = false;
  @Input({ transform: booleanAttribute }) loading = false;
  @Input({ transform: numberAttribute }) minSearchLength = 0;

  @Output() selectionChange = new EventEmitter<unknown>();
  @Output() searchTermChange = new EventEmitter<string>();

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
  private mobileContainerEl: HTMLElement | null = null;
  private mobileTouchStartHandler: ((event: TouchEvent) => void) | null = null;
  private backdropEl: HTMLElement | null = null;
  private outsidePointerHandler: ((event: Event) => void) | null = null;
  private sheetSearchEl: HTMLInputElement | null = null;
  private sheetSearchHandler: ((event: Event) => void) | null = null;
  private sheetSearchKeydownHandler: ((event: KeyboardEvent) => void) | null = null;
  readonly typeahead$ = new Subject<string>();
  private typeaheadSub?: Subscription;
  private panelScrollEl: HTMLElement | null = null;
  private panelWheelHandler: ((event: WheelEvent) => void) | null = null;
  private panelScrollSyncHandler: (() => void) | null = null;
  private panelScrollRaf = 0;
  private panelScrollTarget = 0;

  constructor(
    private readonly hostRef: ElementRef<HTMLElement>,
    private readonly cdr: ChangeDetectorRef,
    private readonly breakpointObserver: BreakpointObserver,
  ) {}

  get isMobileViewport(): boolean {
    return this.breakpointObserver.isMatched(EV_SELECT_MOBILE_QUERY);
  }

  get inputId(): string {
    return this.id ?? this.fallbackId;
  }

  get isSearchable(): boolean {
    // En móvil la búsqueda vive en el sheet, no en el input fantasma del control.
    return !this.isMobileViewport && this.searchEnabled;
  }

  /** Búsqueda pedida por configuración, sin importar el viewport. */
  get searchEnabled(): boolean {
    if (this.serverSideSearch || this.searchable === true) {
      return true;
    }
    if (this.searchable === false) {
      return false;
    }
    return this.optionsSnapshot.length >= this.searchThreshold;
  }

  get openOnEnterEnabled(): boolean {
    return !this.isMobileViewport;
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
    if (this.serverSideSearch) {
      this.typeaheadSub = this.typeahead$.subscribe((term) => {
        this.searchTermChange.emit(term ?? '');
      });
    }
    this.applyValue(this.currentValue);
    this.ngSelect?.setDisabledState(this.disabled);
    this.applyMobileKeyboardGuard();
  }

  ngOnDestroy(): void {
    this.typeaheadSub?.unsubscribe();
    this.unbindOutsidePointerClose();
    this.removeBackdrop();
    this.cleanupMobilePanel();
    this.teardownMobileContainerOpen();
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
      this.mountBackdrop();
      this.lockBodyScroll();
    }
    this.bindOutsidePointerClose();
    this.schedulePanelDecoration();
    this.applyMobileKeyboardGuard();
    this.cdr.markForCheck();
  }

  onClose(): void {
    this.isOpen = false;
    this.unbindOutsidePointerClose();
    this.removeBackdrop();
    this.cleanupMobilePanel();
    this.unlockBodyScroll();
    this.onTouched();
    this.cdr.markForCheck();
  }

  closePanel(): void {
    this.ngSelect?.close();
  }

  /**
   * El backdrop vive en `body` (no en el host) para que ningún ancestro con
   * transform/filter lo recorte y deje de cubrir la página en móvil.
   */
  private mountBackdrop(): void {
    if (this.backdropEl) {
      return;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'ev-select-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.appendChild(backdrop);
    this.backdropEl = backdrop;
  }

  private removeBackdrop(): void {
    this.backdropEl?.remove();
    this.backdropEl = null;
  }

  /** Cierra el panel al tocar cualquier punto fuera del control o del panel. */
  private bindOutsidePointerClose(): void {
    if (this.outsidePointerHandler) {
      return;
    }

    this.outsidePointerHandler = (event: Event) => {
      if (!this.isOpen) {
        return;
      }

      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (this.hostRef.nativeElement.contains(target)) {
        return;
      }

      const panel = this.mobilePanelEl ?? this.getOpenPanel();
      if (panel?.contains(target)) {
        return;
      }

      this.closePanel();
    };

    document.addEventListener('pointerdown', this.outsidePointerHandler, { capture: true });
  }

  private unbindOutsidePointerClose(): void {
    if (this.outsidePointerHandler) {
      document.removeEventListener('pointerdown', this.outsidePointerHandler, { capture: true });
    }
    this.outsidePointerHandler = null;
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
      this.applyMobileKeyboardGuard();
    });
  }

  private applyMobileKeyboardGuard(): void {
    if (!this.isMobileViewport) {
      this.teardownMobileContainerOpen();
      return;
    }

    requestAnimationFrame(() => {
      const roots: HTMLElement[] = [this.hostRef.nativeElement];
      const panel = this.getOpenPanel();
      if (panel) {
        roots.push(panel);
      }

      for (const root of roots) {
        root.querySelectorAll('input').forEach((node) => {
          if (node.dataset['evSheetSearch'] === '1') {
            return;
          }
          this.guardMobileInput(node);
        });
      }

      this.bindMobileContainerOpen();
    });
  }

  private guardMobileInput(input: HTMLInputElement): void {
    if (input.dataset['evMobileKbGuard'] === '1') {
      return;
    }

    input.dataset['evMobileKbGuard'] = '1';
    input.readOnly = true;
    input.inputMode = 'none';
    input.autocomplete = 'off';
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');

    input.addEventListener(
      'focus',
      () => {
        if (!this.isMobileViewport || this.disabled) {
          return;
        }

        input.readOnly = true;
        if (!this.isOpen) {
          queueMicrotask(() => this.ngSelect?.open());
        }
      },
      { capture: true },
    );
  }

  private bindMobileContainerOpen(): void {
    const container = this.hostRef.nativeElement.querySelector(
      '.ng-select-container',
    ) as HTMLElement | null;

    if (!container) {
      return;
    }

    if (this.mobileContainerEl === container && this.mobileTouchStartHandler) {
      return;
    }

    this.teardownMobileContainerOpen();
    this.mobileContainerEl = container;

    this.mobileTouchStartHandler = (event: TouchEvent) => {
      if (this.disabled || this.isOpen) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target?.closest('.ng-clear-wrapper')) {
        return;
      }

      event.preventDefault();
      this.ngSelect?.open();
    };

    container.addEventListener('touchstart', this.mobileTouchStartHandler, { passive: false });
  }

  private teardownMobileContainerOpen(): void {
    if (this.mobileContainerEl && this.mobileTouchStartHandler) {
      this.mobileContainerEl.removeEventListener('touchstart', this.mobileTouchStartHandler);
    }

    this.mobileContainerEl = null;
    this.mobileTouchStartHandler = null;
  }

  private decoratePanel(panel: HTMLElement): void {
    this.cleanupMobilePanel();
    this.mobilePanelEl = panel;
    panel.classList.add('ev-select-panel');

    if (!this.isMobileSheet) {
      const hostWidth = this.hostRef.nativeElement.getBoundingClientRect().width;
      if (hostWidth > 0) {
        panel.style.minWidth = `${hostWidth}px`;
        panel.style.width = `${hostWidth}px`;
      }
    } else {
      panel.classList.add('ev-select-panel--sheet');

      if (!panel.querySelector('.ev-select-sheet-head')) {
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

        if (this.searchEnabled) {
          this.mountSheetSearch(head);
        }
      }
    }

    this.bindPanelSmoothScroll(panel);
  }

  /**
   * En móvil el input del control está bloqueado para no abrir el teclado, así
   * que la búsqueda se hace con un input real dentro del sheet.
   */
  private mountSheetSearch(head: HTMLElement): void {
    const field = document.createElement('label');
    field.className = 'ev-select-sheet-search';
    field.innerHTML = `
      <span class="material-icons" aria-hidden="true">search</span>
      <input
        type="text"
        class="ev-select-sheet-search__input"
        data-ev-sheet-search="1"
        inputmode="search"
        enterkeyhint="search"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        placeholder="${this.escapeHtml(this.searchPlaceholder)}"
        aria-label="${this.escapeHtml(this.searchPlaceholder)}"
      />
    `;

    const input = field.querySelector('input') as HTMLInputElement | null;
    if (!input) {
      return;
    }

    this.sheetSearchHandler = () => {
      this.ngSelect?.filter(input.value);
      this.cdr.markForCheck();
    };
    this.sheetSearchKeydownHandler = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
      }
    };

    input.addEventListener('input', this.sheetSearchHandler);
    input.addEventListener('keydown', this.sheetSearchKeydownHandler);

    head.appendChild(field);
    this.sheetSearchEl = input;

    if (this.shouldAutofocusSheetSearch) {
      setTimeout(() => input.focus({ preventScroll: true }), 120);
    }
  }

  /** Con listas largas o búsqueda en servidor el teclado se abre de una. */
  private get shouldAutofocusSheetSearch(): boolean {
    return this.serverSideSearch || this.optionsSnapshot.length >= this.searchThreshold;
  }

  private cleanupSheetSearch(): void {
    if (this.sheetSearchEl) {
      if (this.sheetSearchHandler) {
        this.sheetSearchEl.removeEventListener('input', this.sheetSearchHandler);
      }
      if (this.sheetSearchKeydownHandler) {
        this.sheetSearchEl.removeEventListener('keydown', this.sheetSearchKeydownHandler);
      }
      this.sheetSearchEl.blur();
    }

    this.sheetSearchEl = null;
    this.sheetSearchHandler = null;
    this.sheetSearchKeydownHandler = null;
  }

  private bindPanelSmoothScroll(panel: HTMLElement): void {
    this.unbindPanelSmoothScroll();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const scroller = panel.querySelector('.ng-dropdown-panel-items') as HTMLElement | null;
    if (!scroller) {
      return;
    }

    this.panelScrollEl = scroller;
    this.panelScrollTarget = scroller.scrollTop;

    const step = () => {
      const el = this.panelScrollEl;
      if (!el) {
        this.panelScrollRaf = 0;
        return;
      }

      const delta = this.panelScrollTarget - el.scrollTop;
      if (Math.abs(delta) < 0.75) {
        el.scrollTop = this.panelScrollTarget;
        this.panelScrollRaf = 0;
        return;
      }

      el.scrollTop += delta * 0.2;
      this.panelScrollRaf = requestAnimationFrame(step);
    };

    this.panelWheelHandler = (event: WheelEvent) => {
      const el = this.panelScrollEl;
      if (!el) {
        return;
      }

      event.preventDefault();
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      this.panelScrollTarget = Math.max(0, Math.min(max, this.panelScrollTarget + event.deltaY));
      if (!this.panelScrollRaf) {
        this.panelScrollRaf = requestAnimationFrame(step);
      }
    };

    this.panelScrollSyncHandler = () => {
      if (!this.panelScrollRaf && this.panelScrollEl) {
        this.panelScrollTarget = this.panelScrollEl.scrollTop;
      }
    };

    scroller.addEventListener('wheel', this.panelWheelHandler, { passive: false });
    scroller.addEventListener('scroll', this.panelScrollSyncHandler, { passive: true });
  }

  private unbindPanelSmoothScroll(): void {
    if (this.panelScrollRaf) {
      cancelAnimationFrame(this.panelScrollRaf);
      this.panelScrollRaf = 0;
    }

    if (this.panelScrollEl) {
      if (this.panelWheelHandler) {
        this.panelScrollEl.removeEventListener('wheel', this.panelWheelHandler);
      }
      if (this.panelScrollSyncHandler) {
        this.panelScrollEl.removeEventListener('scroll', this.panelScrollSyncHandler);
      }
    }

    this.panelScrollEl = null;
    this.panelWheelHandler = null;
    this.panelScrollSyncHandler = null;
    this.panelScrollTarget = 0;
  }

  private cleanupMobilePanel(): void {
    this.unbindPanelSmoothScroll();
    this.cleanupSheetSearch();
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
