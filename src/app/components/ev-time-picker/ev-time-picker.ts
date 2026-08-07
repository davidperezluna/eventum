import { BreakpointObserver } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import {
  AfterViewChecked,
  Component,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
  QueryList,
  ViewChild,
  ViewChildren,
  booleanAttribute,
  forwardRef,
  numberAttribute,
} from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Subscription } from 'rxjs';import {
  EvTimeSlot,
  formatTimeDisplay,
  generateTimeSlots,
} from '../../core/datetime-picker';

let evTimePickerIdCounter = 0;

@Component({
  selector: 'ev-time-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ev-time-picker.html',
  styleUrl: './ev-time-picker.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => EvTimePicker),
      multi: true,
    },
  ],
})
export class EvTimePicker implements ControlValueAccessor, AfterViewChecked, OnDestroy {  @ViewChild('trigger') triggerRef?: ElementRef<HTMLButtonElement>;
  @ViewChild('popover') popoverRef?: ElementRef<HTMLElement>;
  @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;
  @ViewChildren('optionBtn') optionButtons?: QueryList<ElementRef<HTMLButtonElement>>;

  @Input() id?: string;
  @Input({ transform: booleanAttribute }) disabled = false;
  @Input({ transform: booleanAttribute }) hasError = false;
  @Input({ transform: numberAttribute }) minuteStep = 30;

  isOpen = false;
  isMobileSheet = false;
  selectedTime = '';
  searchTerm = '';
  isDisabled = false;
  popoverStyle: Record<string, string> = {};
  private shouldScrollToSelected = false;
  private readonly fallbackId = `ev-time-picker-${++evTimePickerIdCounter}`;
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};
  private viewportSub?: Subscription;

  constructor(private readonly breakpointObserver: BreakpointObserver) {
    this.viewportSub = this.breakpointObserver
      .observe('(max-width: 640px)')
      .subscribe((state) => {
        this.isMobileSheet = state.matches;
        if (this.isOpen) {
          this.updatePopoverPosition();
        }
      });
  }

  ngOnDestroy(): void {
    this.viewportSub?.unsubscribe();
    this.unlockBodyScroll();
  }
  get inputId(): string {
    return this.id ?? this.fallbackId;
  }

  get inputDisabled(): boolean {
    return this.disabled || this.isDisabled;
  }

  get displayLabel(): string {
    return formatTimeDisplay(this.selectedTime);
  }

  get isPlaceholder(): boolean {
    return !this.selectedTime;
  }

  get filteredSlots(): EvTimeSlot[] {
    const query = this.searchTerm.trim().toLowerCase();
    const slots = generateTimeSlots(this.minuteStep);
    if (!query) return slots;
    return slots.filter(
      (slot) =>
        slot.label.toLowerCase().includes(query) ||
        slot.value.includes(query.replace(/\s*(am|pm)/gi, '')),
    );
  }

  get showSearch(): boolean {
    return generateTimeSlots(this.minuteStep).length > 12;
  }

  ngAfterViewChecked(): void {
    if (!this.shouldScrollToSelected || !this.isOpen) return;
    const selected = this.optionButtons?.find((btn) =>
      btn.nativeElement.classList.contains('ev-dtp-time__option--selected'),
    );
    selected?.nativeElement.scrollIntoView({ block: 'nearest' });
    this.shouldScrollToSelected = false;
  }

  writeValue(value: string | null | undefined): void {
    this.selectedTime = value ?? '';
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

  toggle(event: Event): void {
    event.stopPropagation();
    if (this.inputDisabled) return;
    this.isOpen ? this.close() : this.open();
  }

  open(): void {
    if (this.inputDisabled) return;
    this.searchTerm = '';
    this.updatePopoverPosition();
    this.isOpen = true;
    this.shouldScrollToSelected = true;
    if (this.isMobileSheet) {
      this.lockBodyScroll();
    }
    setTimeout(() => this.searchInputRef?.nativeElement.focus(), 0);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.searchTerm = '';
    this.unlockBodyScroll();
    this.onTouched();
  }
  selectSlot(value: string): void {
    this.selectedTime = value;
    this.onChange(value);
    this.close();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isOpen) return;
    const target = event.target as Node;
    if (this.triggerRef?.nativeElement.contains(target)) return;
    if (this.popoverRef?.nativeElement.contains(target)) return;
    this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  @HostListener('window:resize')
  @HostListener('window:scroll')
  onViewportChange(): void {
    if (this.isOpen) {
      this.updatePopoverPosition();
    }
  }

  private updatePopoverPosition(): void {
    if (this.isMobileSheet) {
      this.popoverStyle = {
        top: 'auto',
        left: '0',
        right: '0',
        bottom: '0',
        width: '100%',
      };
      return;
    }

    const trigger = this.triggerRef?.nativeElement;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.max(rect.width, 240);
    let left = rect.left;
    if (left + width > window.innerWidth - 12) {
      left = window.innerWidth - width - 12;
    }
    left = Math.max(12, left);

    let top = rect.bottom + 8;
    const estimatedHeight = 320;
    if (top + estimatedHeight > window.innerHeight - 12) {
      top = Math.max(12, rect.top - estimatedHeight - 8);
    }

    this.popoverStyle = {
      top: `${top}px`,
      left: `${left}px`,
      width: `${width}px`,
    };
  }

  private lockBodyScroll(): void {
    document.body.style.overflow = 'hidden';
  }

  private unlockBodyScroll(): void {
    document.body.style.overflow = '';
  }
}