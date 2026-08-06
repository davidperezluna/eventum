import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface FaqItem {
  question: string;
  answer: string;
}

@Component({
  selector: 'app-faq-accordion',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './faq-accordion.html',
  styleUrl: './faq-accordion.css',
})
export class FaqAccordion {
  @Input() items: FaqItem[] = [];
  @Input() ariaLabel = 'Preguntas frecuentes';

  openIndex: number | null = null;

  toggle(index: number): void {
    this.openIndex = this.openIndex === index ? null : index;
  }

  isOpen(index: number): boolean {
    return this.openIndex === index;
  }

  panelId(index: number): string {
    return `faq-panel-${index}`;
  }

  buttonId(index: number): string {
    return `faq-button-${index}`;
  }
}
