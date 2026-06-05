import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import {
  guardarReturnUrlLogin,
  LOGIN_MOTIVO_TEXTO,
} from '../../core/login-redirect';

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
  contextoLogin: string | null = null;

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  async ngOnInit() {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    const motivo = this.route.snapshot.queryParamMap.get('motivo');
    guardarReturnUrlLogin(returnUrl);
    if (motivo && LOGIN_MOTIVO_TEXTO[motivo]) {
      this.contextoLogin = LOGIN_MOTIVO_TEXTO[motivo];
    } else if (returnUrl) {
      this.contextoLogin = 'Entra para continuar donde lo dejaste.';
    }

    await this.authService.waitForInitialization();

    if (!this.authService.isAuthenticated()) {
      return;
    }

    const usuario = this.authService.getUsuario();
    if (!usuario) {
      return;
    }

    if (this.authService.canLoginViaLoginAdmin(usuario.tipo_usuario_id)) {
      await this.router.navigateByUrl(this.authService.getHomeRouteForUsuario(usuario), {
        replaceUrl: true,
      });
      return;
    }

    await this.router.navigateByUrl(this.authService.getHomeRouteForUsuario(usuario), {
      replaceUrl: true,
    });
  }

  async onLoginWithGoogle() {
    this.loading = true;
    this.error = null;
    guardarReturnUrlLogin(this.route.snapshot.queryParamMap.get('returnUrl'));

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
