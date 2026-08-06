import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

export interface EvWizardStep {
  id: string;
  label: string;
}

@Component({
  selector: 'ev-form-wizard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ev-form-wizard.html',
  styleUrl: './ev-form-wizard.css',
})
export class EvFormWizard {
  @Input({ required: true }) steps: EvWizardStep[] = [];
  @Input() currentStep = 0;

  get progressPercent(): number {
    if (this.steps.length <= 1) {
      return 100;
    }
    return Math.round((this.currentStep / (this.steps.length - 1)) * 100);
  }

  isCompleted(index: number): boolean {
    return index < this.currentStep;
  }

  isCurrent(index: number): boolean {
    return index === this.currentStep;
  }
}
