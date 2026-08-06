import {
  Component,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  ViewChild,
  OnInit,
  OnChanges,
  SimpleChanges,
  HostListener,
  NgZone,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { EvDrawerSize } from '../../core/drawer/drawer.types';
import { focusInitialElement, trapFocus } from '../../core/drawer/drawer-focus.util';
import { EvDrawerSkeleton } from './ev-drawer-skeleton';

@Component({
  selector: 'ev-drawer',
  standalone: true,
  imports: [CommonModule, EvDrawerSkeleton],
  templateUrl: './ev-drawer.html',
  styleUrl: './ev-drawer.css',
})
export class EvDrawer implements OnInit, OnChanges {
  @Input({ required: true }) title!: string;
  @Input() description = '';
  @Input() icon = '';
  @Input() size: EvDrawerSize = 'md';
  @Input() loading = false;
  @Input() open = false;
  @Input() closing = false;
  @Input() closeOnBackdrop = true;
  @Input() closeOnEscape = true;
  @Input() showCloseButton = true;
  @Input() ariaLabel?: string;

  @Output() closeRequested = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();
  @Output() opened = new EventEmitter<void>();

  @ViewChild('panel') panelRef?: ElementRef<HTMLElement>;
  @ViewChild('closeBtn') closeBtnRef?: ElementRef<HTMLButtonElement>;

  /** Mantiene el drawer en DOM durante animaciones */
  visible = false;
  /** Controla transform del panel (entrada/salida) */
  panelOpen = false;

  private previousActiveElement: HTMLElement | null = null;
  private scrollLocked = false;
  private closeFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly ngZone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    if (this.open) {
      this.beginOpen();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']) {
      if (this.open) {
        this.beginOpen();
      } else if (!this.closing) {
        this.hideImmediately();
      } else {
        this.beginClose();
      }
    }

    if (changes['closing'] && this.closing && !this.open) {
      this.beginClose();
    }
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (!this.visible || !this.panelOpen || !this.closeOnEscape) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.requestClose();
    }
  }

  @HostListener('keydown', ['$event'])
  onPanelKeydown(event: KeyboardEvent): void {
    if (!this.panelRef?.nativeElement) {
      return;
    }
    trapFocus(this.panelRef.nativeElement, event);
  }

  onBackdropClick(): void {
    if (this.closeOnBackdrop) {
      this.requestClose();
    }
  }

  requestClose(): void {
    this.closeRequested.emit();
  }

  onTransitionEnd(event: TransitionEvent): void {
    if (event.target !== this.panelRef?.nativeElement || event.propertyName !== 'transform') {
      return;
    }

    if (!this.open && this.closing) {
      this.clearCloseFallback();
      this.hideImmediately();
      this.closed.emit();
    }
  }

  get panelClass(): string {
    return `ev-drawer__panel ev-drawer__panel--${this.size}`;
  }

  get rootClass(): string {
    return [
      'ev-drawer',
      this.visible ? 'ev-drawer--visible' : '',
      this.panelOpen ? 'ev-drawer--open' : '',
      this.closing ? 'ev-drawer--closing' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private beginOpen(): void {
    this.visible = true;
    this.previousActiveElement = document.activeElement as HTMLElement | null;
    this.lockScroll();
    this.cdr.detectChanges();

    this.runAfterPaint(() => {
      this.panelOpen = true;
      if (this.panelRef?.nativeElement) {
        focusInitialElement(this.panelRef.nativeElement, this.closeBtnRef?.nativeElement ?? null);
      }
      this.opened.emit();
    });
  }

  private beginClose(): void {
    this.panelOpen = false;
    this.unlockScroll();
    this.scheduleCloseFallback();
    this.cdr.detectChanges();
  }

  private hideImmediately(): void {
    this.clearCloseFallback();
    this.visible = false;
    this.panelOpen = false;
    this.unlockScroll();
    this.restoreFocus();
    this.cdr.detectChanges();
  }

  /** rAF corre fuera de Angular; reentramos para pintar panelOpen como los drawers async. */
  private runAfterPaint(fn: () => void): void {
    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.ngZone.run(() => {
            fn();
            this.cdr.detectChanges();
          });
        });
      });
    });
  }

  private scheduleCloseFallback(): void {
    this.clearCloseFallback();
    this.closeFallbackTimer = setTimeout(() => {
      this.ngZone.run(() => {
        if (!this.open && this.closing && this.visible) {
          this.hideImmediately();
          this.closed.emit();
        }
      });
    }, 320);
  }

  private clearCloseFallback(): void {
    if (this.closeFallbackTimer) {
      clearTimeout(this.closeFallbackTimer);
      this.closeFallbackTimer = null;
    }
  }

  private lockScroll(): void {
    if (this.scrollLocked) {
      return;
    }
    document.documentElement.classList.add('ev-drawer-open');
    this.scrollLocked = true;
  }

  private unlockScroll(): void {
    if (!this.scrollLocked) {
      return;
    }
    document.documentElement.classList.remove('ev-drawer-open');
    this.scrollLocked = false;
  }

  private restoreFocus(): void {
    this.previousActiveElement?.focus?.();
    this.previousActiveElement = null;
  }
}
