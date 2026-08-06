import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EvPanelSummaryMetric } from './ev-panel-summary.types';

@Component({
  selector: 'ev-panel-summary',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ev-panel-summary.html',
  styleUrl: './ev-panel-summary.css',
})
export class EvPanelSummary {
  @Input() label = 'Resumen';
  @Input() metrics: EvPanelSummaryMetric[] = [];
  @Input() hint = '';

  get hasHero(): boolean {
    return this.metrics.some((m) => m.variant === 'hero');
  }
}
