import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login-lector',
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login-lector.html',
  styleUrl: './login-lector.css',
})
export class LoginLector implements OnInit {
  loginForm: FormGroup;
  loading = false;
  error: string | null = null;
  returnUrl = '/lector/inicio';

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

  ngOnInit(): void {
    if (this.authService.isAuthenticated() && this.authService.isLector()) {
      this.router.navigate(['/lector/inicio']);
      return;
    }
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/lector/inicio';
  }

  get email() {
    return this.loginForm.get('email');
  }
  get password() {
    return this.loginForm.get('password');
  }

  async onSubmit(): Promise<void> {
    if (this.loginForm.invalid) return;

    this.loading = true;
    this.error = null;

    try {
      const response = await this.authService.login(
        {
          email: this.loginForm.get('email')?.value,
          password: this.loginForm.get('password')?.value,
        },
        { context: 'lector' }
      );

      if (response.error) {
        this.error = response.error.message || 'Error al iniciar sesión';
        this.loading = false;
        return;
      }

      if (response.user && response.usuario) {
        this.router.navigateByUrl(this.returnUrl);
      } else {
        this.error = 'Error al cargar datos del usuario';
      }
    } catch {
      this.error = 'Error de conexión';
    } finally {
      this.loading = false;
    }
  }
}
