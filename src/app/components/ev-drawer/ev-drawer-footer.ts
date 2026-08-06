import { Component, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'ev-drawer-footer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <footer class="ev-drawer-footer">
      <ng-content />
    </footer>
  `,
  encapsulation: ViewEncapsulation.None,
})
export class EvDrawerFooter {}
