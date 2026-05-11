import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

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
    if (this.authService.isAuthenticated()) {
      const usuario = this.authService.getUsuario();
      if (usuario) {
        let dashboardRoute = '/dashboard';
        if (usuario.tipo_usuario_id === 2) {
          dashboardRoute = '/dashboard-organizador';
        } else if (usuario.tipo_usuario_id === 1) {
          dashboardRoute = '/eventos-cliente';
        }
        this.router.navigate([dashboardRoute]);
      } else {
        this.router.navigate(['/dashboard']);
      }
      return;
    }
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
