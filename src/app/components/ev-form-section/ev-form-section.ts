import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'ev-form-section',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ev-form-section.html',
  styleUrl: './ev-form-section.css',
})
export class EvFormSection {
  @Input({ required: true }) title!: string;
  @Input() description = '';
  /** Material icon name (ej. `confirmation_number`). */
  @Input() icon = '';
}
