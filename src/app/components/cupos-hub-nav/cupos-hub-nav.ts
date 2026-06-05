import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { CUPOS_LABELS } from '../../core/cupos-labels';
import { irALoginCliente } from '../../core/login-redirect';

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

  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}

  get isLoggedIn(): boolean {
    return !!this.authService.getCurrentUser();
  }

  onMisAvisosClick(event: Event): void {
    if (this.isLoggedIn) return;
    event.preventDefault();
    irALoginCliente(this.router, '/mis-cupos', 'mis-publicaciones');
  }
}
