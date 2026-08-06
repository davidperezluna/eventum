import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'ev-panel-card',
  standalone: true,
  imports: [CommonModule],
  template: `<article [class]="classNames"><ng-content /></article>`,
  styleUrl: './ev-panel-card.css',
})
export class EvPanelCard {
  @Input() inactive = false;

  get classNames(): string {
    return ['ev-panel-card', this.inactive ? 'ev-panel-card--inactive' : ''].filter(Boolean).join(' ');
  }
}
