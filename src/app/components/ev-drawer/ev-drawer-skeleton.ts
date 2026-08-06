import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'ev-drawer-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="ev-drawer-skeleton" [attr.aria-busy]="true" aria-label="Cargando contenido">
      <div *ngFor="let block of blocks" class="ev-drawer-skeleton__block" [style.height.px]="block"></div>
    </div>
  `,
  styleUrl: './ev-drawer-skeleton.css',
})
export class EvDrawerSkeleton {
  @Input() rows = 5;

  get blocks(): number[] {
    const heights = [18, 44, 120, 44, 88, 44, 64];
    return heights.slice(0, Math.max(1, this.rows));
  }
}
