import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-auth-callback',
  imports: [CommonModule],
  template: `
    <div class="callback-container">
      <div class="callback-content">
        <div *ngIf="isLoading" class="callback-loading">
          <div class="spinner"></div>
          <h2>Autenticando con Google...</h2>
          <p>Por favor espera mientras completamos tu inicio de sesión.</p>
        </div>

        <div *ngIf="error && !isLoading" class="callback-error">
          <span class="material-icons">error</span>
          <h2>Error</h2>
          <p>{{ error }}</p>
          <p>Redirigiendo al login...</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .callback-container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 2rem;
      background: var(--background-color, #f5f5f5);
    }

    .callback-content {
      text-align: center;
      max-width: 400px;
      width: 100%;
    }

    .callback-loading {
      h2 {
        color: var(--text-primary, #333);
        margin: 1.5rem 0 0.5rem;
      }
      
      p {
        color: var(--text-secondary, #666);
        font-size: 0.95rem;
      }
    }

    .callback-error {
      span.material-icons {
        font-size: 3rem;
        color: #d32f2f;
        margin-bottom: 1rem;
      }

      h2 {
        color: #d32f2f;
        margin-bottom: 1rem;
      }
      
      p {
        color: var(--text-secondary, #666);
        margin-bottom: 0.5rem;
      }
    }

    .spinner {
      border: 4px solid #f3f3f3;
      border-top: 4px solid #667eea;
      border-radius: 50%;
      width: 50px;
      height: 50px;
      animation: spin 1s linear infinite;
      margin: 0 auto;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `]
})
export class AuthCallback implements OnInit, OnDestroy {
  isLoading = true;
  error: string | null = null;
  private unsubscribeAuthState: (() => void) | null = null;

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnDestroy() {
    if (this.unsubscribeAuthState) {
      this.unsubscribeAuthState();
    }
  }

  async ngOnInit() {
    try {
      const queryParams = this.route.snapshot.queryParams;

      // Verificar si hay un error en la URL
      if (queryParams['error']) {
        this.error = queryParams['error_description'] || 'Error al autenticar con Google';
        this.isLoading = false;
        setTimeout(() => {
          this.router.navigate(['/login']);
        }, 3000);
        return;
      }

      // Supabase maneja automáticamente el callback OAuth
      // Esperar un momento para que Supabase procese el callback
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Verificar si hay sesión después del callback
      const session = this.authService.getSession();
      const user = this.authService.getCurrentUser();

      if (session && user) {
        // Esperar a que se carguen los datos del usuario
        let usuarioLoaded = false;
        this.unsubscribeAuthState = this.authService.onAuthStateChange((currentUser, usuario, currentSession) => {
          if (usuario && !usuarioLoaded) {
            usuarioLoaded = true;
            if (this.unsubscribeAuthState) {
              this.unsubscribeAuthState();
              this.unsubscribeAuthState = null;
            }
            this.isLoading = false;
            
            // Redirigir según tipo de usuario
            let dashboardRoute = '/dashboard';
            if (usuario.tipo_usuario_id === 2) {
              dashboardRoute = '/dashboard-organizador';
            } else if (usuario.tipo_usuario_id === 1) {
              dashboardRoute = '/eventos-cliente';
            }
            
            this.router.navigate([dashboardRoute]);
          }
        });

        // Timeout de 10 segundos
        setTimeout(() => {
          if (!usuarioLoaded) {
            if (this.unsubscribeAuthState) {
              this.unsubscribeAuthState();
              this.unsubscribeAuthState = null;
            }
            const usuario = this.authService.getUsuario();
            if (usuario) {
              this.isLoading = false;
              let dashboardRoute = '/dashboard';
              if (usuario.tipo_usuario_id === 2) {
                dashboardRoute = '/dashboard-organizador';
              } else if (usuario.tipo_usuario_id === 1) {
                dashboardRoute = '/eventos-cliente';
              }
              this.router.navigate([dashboardRoute]);
            } else {
              this.error = 'Error al cargar los datos del usuario. Intenta iniciar sesión nuevamente.';
              this.isLoading = false;
              setTimeout(() => {
                this.router.navigate(['/login']);
              }, 3000);
            }
          }
        }, 10000);
      } else {
        // No hay sesión, redirigir al login
        this.error = 'No se pudo completar la autenticación. Intenta de nuevo.';
        this.isLoading = false;
        setTimeout(() => {
          this.router.navigate(['/login']);
        }, 3000);
      }
    } catch (error: any) {
      console.error('Error en callback:', error);
      this.error = error.message || 'Error al procesar la autenticación';
      this.isLoading = false;
      setTimeout(() => {
        this.router.navigate(['/login']);
      }, 3000);
    }
  }
}

