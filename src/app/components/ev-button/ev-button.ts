import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type EvButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type EvButtonSize = 'sm' | 'md';

@Component({
  selector: 'ev-button',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ev-button.html',
  styleUrl: './ev-button.css',
})
export class EvButton {
  @Input() variant: EvButtonVariant = 'primary';
  @Input() size: EvButtonSize = 'md';
  @Input() type: 'button' | 'submit' = 'button';
  @Input() disabled = false;
  @Input() loading = false;
  @Input() fullWidth = false;

  get classNames(): string {
    return [
      'ev-button',
      `ev-button--${this.variant}`,
      `ev-button--${this.size}`,
      this.fullWidth ? 'ev-button--full' : '',
      this.loading ? 'ev-button--loading' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }
}
