import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

/**
 * Ruta oculta `/login-admin`: solo email/contraseña para pruebas internas.
 * El acceso público sigue en `/login` (Google).
 */
@Component({
  selector: 'app-login-admin',
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login-admin.html',
  styleUrls: ['../login/login.css', './login-admin.css'],
})
export class LoginAdmin implements OnInit {
  loginForm: FormGroup;
  loading = false;
  error: string | null = null;
  returnUrl = '/dashboard';

  constructor(
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.loginForm = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

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

    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/dashboard';
  }

  async onSubmit() {
    if (this.loginForm.invalid) {
      return;
    }

    this.loading = true;
    this.error = null;

    const credentials = {
      email: this.loginForm.get('email')?.value,
      password: this.loginForm.get('password')?.value,
    };

    try {
      const response = await this.authService.login(credentials);
      if (response.error) {
        this.error = response.error.message || 'Error al iniciar sesión';
        this.loading = false;
        return;
      }

      if (response.usuario && response.user) {
        let dashboardRoute = '/dashboard';
        if (response.usuario.tipo_usuario_id === 2) {
          dashboardRoute = '/dashboard-organizador';
        } else if (response.usuario.tipo_usuario_id === 1) {
          dashboardRoute = '/eventos-cliente';
        }

        const finalUrl = this.returnUrl === '/dashboard' ? dashboardRoute : this.returnUrl;
        this.loading = false;
        await this.router.navigate([finalUrl]);
      } else {
        this.error = 'Error al cargar datos del usuario. Verifica que el usuario esté registrado correctamente.';
        this.loading = false;
      }
    } catch (err) {
      console.error('Error en login:', err);
      this.error = 'Error de conexión. Por favor, intenta nuevamente.';
      this.loading = false;
    }
  }

  get email() {
    return this.loginForm.get('email');
  }

  get password() {
    return this.loginForm.get('password');
  }
}
