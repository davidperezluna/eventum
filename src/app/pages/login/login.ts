import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login implements OnInit {
  loginForm: FormGroup;
  loading = false;
  error: string | null = null;
  returnUrl: string = '/eventos-cliente';

  constructor(
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.loginForm = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  ngOnInit() {
    // Si ya está autenticado, redirigir al dashboard correcto
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

    // Obtener la URL de retorno si existe
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/eventos-cliente';
  }

  async onSubmit() {
    if (this.loginForm.invalid) {
      return;
    }

    this.loading = true;
    this.error = null;

    const credentials = {
      email: this.loginForm.get('email')?.value,
      password: this.loginForm.get('password')?.value
    };

    try {
      const response = await this.authService.login(credentials);
      console.log('Respuesta del login en componente:', response);
      
      if (response.error) {
        console.error('Error en login:', response.error);
        this.error = response.error.message || 'Error al iniciar sesión';
        this.loading = false;
        return;
      }
      
      if (response.usuario && response.user) {
        console.log('Login exitoso, redirigiendo según tipo de usuario');
        // Determinar dashboard según tipo de usuario
        let dashboardRoute = '/dashboard';
        if (response.usuario.tipo_usuario_id === 2) {
          dashboardRoute = '/dashboard-organizador';
        } else if (response.usuario.tipo_usuario_id === 1) {
          dashboardRoute = '/eventos-cliente';
        }
        
        // Si returnUrl es /dashboard, usar el dashboard correcto
        const finalUrl = this.returnUrl === '/dashboard' ? dashboardRoute : this.returnUrl;
        
        // Login exitoso y usuario válido, redirigir
        this.loading = false;
        this.router.navigate([finalUrl]).then(
          (success) => {
            console.log('Navegación exitosa:', success);
          },
          (error) => {
            console.error('Error en navegación:', error);
          }
        );
      } else {
        console.warn('Login incompleto - usuario o user faltante:', { usuario: response.usuario, user: response.user });
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

  async onLoginWithGoogle() {
    this.loading = true;
    this.error = null;
    
    try {
      const response = await this.authService.signInWithGoogle();
      if (response.error) {
        this.error = 'No se pudo iniciar sesión con Google. Intenta de nuevo.';
        this.loading = false;
      }
      // Si no hay error, el usuario será redirigido a /auth/callback
      // y luego al dashboard automáticamente
    } catch (error) {
      console.error('Error inesperado:', error);
      this.error = 'Ocurrió un error inesperado';
      this.loading = false;
    }
  }
}
