import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { CUPOS_LABELS } from '../../core/cupos-labels';

export type CuposHubSeccion = 'explorar' | 'mis' | 'evento';

@Component({
  selector: 'app-cupos-hub-nav',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './cupos-hub-nav.html',
  styleUrl: './cupos-hub-nav.css',
  host: { class: 'cupos-hub-nav-host' },
})
export class CuposHubNav {
  readonly labels = CUPOS_LABELS;

  @Input() seccion: CuposHubSeccion = 'explorar';
  @Input() respuestasCupos = 0;
  @Input() eventoTitulo: string | null = null;

  constructor(private authService: AuthService) {}

  get isLoggedIn(): boolean {
    return !!this.authService.getCurrentUser();
  }
}
