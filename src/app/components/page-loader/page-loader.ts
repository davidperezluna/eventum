import { Component, ChangeDetectionStrategy, input, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'app-page-loader',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <div
      class="loading-state"
      [class.loading-state--compact]="compact()"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div class="app-loader-ring spinner" aria-hidden="true"></div>
      @if (message().trim().length > 0) {
        <p>{{ message() }}</p>
      }
    </div>
  `,
})
export class PageLoaderComponent {
  readonly message = input('Cargando…');
  readonly compact = input(false);
}
