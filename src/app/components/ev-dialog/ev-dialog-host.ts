import {
  Component,
  OnDestroy,
  inject,
  ChangeDetectorRef,
  ViewChild,
  ElementRef,
  AfterViewInit,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { EvDialogService } from '../../core/ev-dialog/ev-dialog.service';
import { EvDialogResolvedConfig, EvDialogState, EvToastState } from '../../core/ev-dialog/ev-dialog.types';

@Component({
  selector: 'ev-dialog-host',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ev-dialog-host.html',
})
export class EvDialogHost implements OnDestroy, AfterViewInit {
  private readonly dialogService = inject(EvDialogService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly cdr = inject(ChangeDetectorRef);

  @ViewChild('panel') panelRef?: ElementRef<HTMLElement>;
  @ViewChild('primaryBtn') primaryBtnRef?: ElementRef<HTMLButtonElement>;

  dialog: EvDialogState = { open: false };
  toast: EvToastState = { visible: false };
  panelVisible = false;

  private subscriptions = new Subscription();
  private enterFrame = 0;

  ngAfterViewInit(): void {
    this.subscriptions.add(
      this.dialogService.dialog$.subscribe((state) => {
        if (state.open) {
          this.dialog = state;
          this.panelVisible = false;
          this.cdr.detectChanges();
          cancelAnimationFrame(this.enterFrame);
          this.enterFrame = requestAnimationFrame(() => {
            this.panelVisible = true;
            this.cdr.detectChanges();
            queueMicrotask(() => this.focusPrimary());
          });
          return;
        }

        this.panelVisible = false;
        this.dialog = state;
        this.cdr.detectChanges();
      }),
    );

    this.subscriptions.add(
      this.dialogService.toast$.subscribe((state) => {
        this.toast = state;
        this.cdr.detectChanges();
      }),
    );
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.enterFrame);
    this.subscriptions.unsubscribe();
  }

  get openDialog(): ({ open: true; id: number } & EvDialogResolvedConfig) | null {
    return this.dialog.open ? this.dialog : null;
  }

  get trustedHtml(): SafeHtml | null {
    const html = this.openDialog?.html?.trim();
    if (!html) {
      return null;
    }
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  toneClass(tone: EvDialogResolvedConfig['tone']): string {
    return `ev-dialog__icon--${tone}`;
  }

  panelClass(): string {
    const dialog = this.openDialog;
    if (!dialog) {
      return 'ev-dialog__panel';
    }
    return [
      'ev-dialog__panel',
      `ev-dialog__panel--${dialog.tone}`,
      dialog.destructive ? 'ev-dialog__panel--destructive' : '',
      this.panelVisible ? 'ev-dialog__panel--visible' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  onBackdropClick(): void {
    const dialog = this.openDialog;
    if (!dialog || dialog.loading || !dialog.allowOutsideClick) {
      return;
    }
    this.dialogService.dismiss();
  }

  onCancel(): void {
    this.dialogService.dismiss();
  }

  onConfirm(): void {
    this.dialogService.respond(true);
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    const dialog = this.openDialog;
    if (!dialog || !dialog.allowEscapeKey || dialog.loading) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.dialogService.dismiss();
    }
  }

  private focusPrimary(): void {
    this.primaryBtnRef?.nativeElement?.focus();
  }
}
