import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type EvBadgeVariant = 'success' | 'warning' | 'danger' | 'neutral' | 'accent';

@Component({
  selector: 'ev-badge',
  standalone: true,
  imports: [CommonModule],
  template: `<span [class]="classNames"><ng-content /></span>`,
  styleUrl: './ev-badge.css',
})
export class EvBadge {
  @Input() variant: EvBadgeVariant = 'neutral';

  get classNames(): string {
    return ['ev-badge', `ev-badge--${this.variant}`].join(' ');
  }
}
