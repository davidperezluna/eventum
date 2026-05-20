import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

/** Acceso público para clientes (Google). Personal usa `/login-admin`. */
@Component({
  selector: 'app-login',
  imports: [CommonModule, RouterModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login implements OnInit {
  loading = false;
  error: string | null = null;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    if (!this.authService.isAuthenticated()) {
      return;
    }

    const usuario = this.authService.getUsuario();
    if (!usuario) {
      return;
    }

    if (this.authService.canLoginViaLoginAdmin(usuario.tipo_usuario_id)) {
      void this.router.navigateByUrl(this.authService.getHomeRouteForUsuario(usuario));
      return;
    }

    void this.router.navigateByUrl(this.authService.getHomeRouteForUsuario(usuario));
  }

  async onLoginWithGoogle() {
    this.loading = true;
    this.error = null;

    try {
      const response = await this.authService.signInWithGoogle();
      if (response.error) {
        this.error = 'No se pudo iniciar sesión con Google. Intenta de nuevo.';
        this.loading = false;
      }
    } catch (error) {
      console.error('Error inesperado:', error);
      this.error = 'Ocurrió un error inesperado';
      this.loading = false;
    }
  }
}
