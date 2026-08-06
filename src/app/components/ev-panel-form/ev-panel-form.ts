import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'ev-panel-form',
  standalone: true,
  imports: [CommonModule],
  template: `<div class="ev-panel-form"><ng-content /></div>`,
  styleUrl: './ev-panel-form.css',
})
export class EvPanelForm {}
