import { CommonModule } from '@angular/common';

import { Component, EventEmitter, Input, Output } from '@angular/core';



export type EvFormModalSize = 'md' | 'lg' | 'xl';



@Component({

  selector: 'ev-form-modal',

  standalone: true,

  imports: [CommonModule],

  templateUrl: './ev-form-modal.html',

  styleUrl: './ev-form-modal.css',

})

export class EvFormModal {

  @Input({ required: true }) title!: string;

  @Input() description = '';

  @Input() size: EvFormModalSize = 'xl';

  @Input() cancelLabel = 'Cancelar';

  @Input() draftLabel = 'Guardar borrador';

  @Input() primaryLabel = 'Guardar';

  @Input() nextLabel = 'Siguiente';

  @Input() prevLabel = 'Anterior';

  @Input() showDraftButton = false;

  @Input() showFooter = true;

  @Input() primaryDisabled = false;

  @Input() draftDisabled = false;

  @Input() nextDisabled = false;

  @Input() closeOnBackdrop = false;

  @Input() wizardMode = false;

  @Input() wizardStep = 0;

  @Input() wizardTotalSteps = 1;



  @Output() cancelled = new EventEmitter<void>();

  @Output() closed = new EventEmitter<void>();

  @Output() primaryAction = new EventEmitter<void>();

  @Output() draftAction = new EventEmitter<void>();

  @Output() wizardNext = new EventEmitter<void>();

  @Output() wizardPrev = new EventEmitter<void>();



  get panelClass(): string {

    return `ev-form-modal__panel ev-form-modal__panel--${this.size}`;

  }



  get isLastWizardStep(): boolean {

    return this.wizardStep >= this.wizardTotalSteps - 1;

  }



  get showWizardPrev(): boolean {

    return this.wizardMode && this.wizardStep > 0;

  }



  get showWizardNext(): boolean {

    return this.wizardMode && !this.isLastWizardStep;

  }



  get showWizardPrimary(): boolean {

    return !this.wizardMode || this.isLastWizardStep;

  }



  onBackdropClick(): void {

    if (this.closeOnBackdrop) {

      this.closed.emit();

    }

  }



  onCancel(): void {

    this.cancelled.emit();

  }



  onClose(): void {

    this.closed.emit();

  }

}


