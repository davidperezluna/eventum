import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-register',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class Register implements OnInit {
  registerForm: FormGroup;
  loading = false;
  error: string | null = null;
  success = false;

  constructor(
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.registerForm = this.formBuilder.group({
      nombre: ['', [Validators.required]],
      apellido: [''],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]]
    }, { validators: this.passwordMatchValidator });
  }

  ngOnInit() {
    // Si ya está autenticado, redirigir al dashboard
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
      }
    }
  }

  passwordMatchValidator(form: FormGroup) {
    const password = form.get('password');
    const confirmPassword = form.get('confirmPassword');
    
    if (password && confirmPassword && password.value !== confirmPassword.value) {
      confirmPassword.setErrors({ passwordMismatch: true });
      return { passwordMismatch: true };
    }
    return null;
  }

  async onSubmit() {
    if (this.registerForm.invalid) {
      return;
    }

    this.loading = true;
    this.error = null;

    const formData = this.registerForm.value;
    const registerData = {
      email: formData.email,
      password: formData.password,
      nombre: formData.nombre,
      apellido: formData.apellido || undefined
    };

    try {
      const response = await this.authService.register(registerData);
      if (response.error) {
        this.error = response.error.message || 'Error al registrar usuario';
        this.loading = false;
        return;
      }

      if (response.user) {
        this.success = true;
        this.loading = false;
        
        // Redirigir al login después de 2 segundos
        setTimeout(() => {
          this.router.navigate(['/login'], {
            queryParams: { registered: 'true' }
          });
        }, 2000);
      }
    } catch (err) {
      console.error('Error en registro:', err);
      this.error = 'Error de conexión. Por favor, intenta nuevamente.';
      this.loading = false;
    }
  }

  async onRegisterWithGoogle() {
    this.loading = true;
    this.error = null;
    
    try {
      const response = await this.authService.signUpWithGoogle();
      if (response.error) {
        this.error = 'No se pudo registrar con Google. Intenta de nuevo.';
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

  onLogin() {
    this.router.navigate(['/login']);
  }

  get nombre() {
    return this.registerForm.get('nombre');
  }

  get apellido() {
    return this.registerForm.get('apellido');
  }

  get email() {
    return this.registerForm.get('email');
  }

  get password() {
    return this.registerForm.get('password');
  }

  get confirmPassword() {
    return this.registerForm.get('confirmPassword');
  }
}


