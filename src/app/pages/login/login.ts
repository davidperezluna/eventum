import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login implements OnInit {
  loginForm: FormGroup;
  loading = false;
  error: string | null = null;
  returnUrl: string = '/dashboard';

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
    // Si ya está autenticado, redirigir al dashboard
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/dashboard']);
      return;
    }

    // Obtener la URL de retorno si existe
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/dashboard';
  }

  onSubmit() {
    if (this.loginForm.invalid) {
      return;
    }

    this.loading = true;
    this.error = null;

    const credentials = {
      email: this.loginForm.get('email')?.value,
      password: this.loginForm.get('password')?.value
    };

    this.authService.login(credentials).subscribe({
      next: (response) => {
        console.log('Respuesta del login en componente:', response);
        
        if (response.error) {
          console.error('Error en login:', response.error);
          this.error = response.error.message || 'Error al iniciar sesión';
          this.loading = false;
          return;
        }
        
        if (response.usuario && response.user) {
          console.log('Login exitoso, redirigiendo a:', this.returnUrl);
          // Login exitoso y usuario válido, redirigir
          this.loading = false;
          this.router.navigate([this.returnUrl]).then(
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
      },
      error: (err) => {
        console.error('Error en subscribe de login:', err);
        this.error = 'Error de conexión. Por favor, intenta nuevamente.';
        this.loading = false;
      },
      complete: () => {
        console.log('Observable de login completado');
      }
    });
  }

  get email() {
    return this.loginForm.get('email');
  }

  get password() {
    return this.loginForm.get('password');
  }
}
