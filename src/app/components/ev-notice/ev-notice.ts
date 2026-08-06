import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  EvNoticeVariant,
  EvNoticeDensity,
  EV_NOTICE_DEFAULT_ICONS,
} from './ev-notice.types';

@Component({
  selector: 'ev-notice',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ev-notice.html',
  styleUrl: './ev-notice.css',
})
export class EvNotice {
  @Input() variant: EvNoticeVariant = 'info';
  @Input() density: EvNoticeDensity = 'default';
  @Input() title = '';
  @Input() message = '';
  @Input() icon = '';
  @Input() actionLabel = '';
  @Input() secondaryActionLabel = '';
  @Input() ariaLabel = '';

  @Output() actionClick = new EventEmitter<void>();
  @Output() secondaryActionClick = new EventEmitter<void>();

  get resolvedIcon(): string {
    return this.icon || EV_NOTICE_DEFAULT_ICONS[this.variant];
  }

  get rootClass(): string {
    return [
      'ev-notice',
      `ev-notice--${this.variant}`,
      this.density !== 'default' ? `ev-notice--${this.density}` : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  get role(): 'status' | 'alert' {
    return this.variant === 'danger' ? 'alert' : 'status';
  }

  get label(): string {
    return this.ariaLabel || this.title || 'Aviso';
  }

  onActionClick(): void {
    this.actionClick.emit();
  }

  onSecondaryActionClick(): void {
    this.secondaryActionClick.emit();
  }
}
