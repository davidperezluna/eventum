import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Rutas /lector/*: solo usuarios con rol Lector autenticados. */
export const lectorAuthGuard: CanActivateFn = async (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await authService.waitForInitialization();

  if (!authService.isAuthenticated() || !authService.getUsuario()) {
    router.navigate(['/login-admin'], { queryParams: { returnUrl: state.url } });
    return false;
  }

  if (!authService.isLector()) {
    router.navigate(['/login-admin']);
    return false;
  }

  return true;
};

