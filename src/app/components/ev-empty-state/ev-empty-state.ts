import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'ev-empty-state',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ev-empty-state.html',
  styleUrl: './ev-empty-state.css',
})
export class EvEmptyState {
  @Input() icon = 'inbox';
  @Input() title = '';
  @Input() description = '';
}
