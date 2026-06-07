import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { coversEventumEnabled } from '../core/covers-feature';
import { AuthService } from '../services/auth.service';

/** Bloquea rutas del módulo covers cuando el feature flag está desactivado. */
export const coversFeatureGuard: CanActivateFn = async () => {
  if (coversEventumEnabled) {
    return true;
  }
  const authService = inject(AuthService);
  const router = inject(Router);
  await authService.waitForInitialization();
  const dest = authService.isAuthenticated() && !authService.isCliente()
    ? '/dashboard'
    : '/eventos-cliente';
  return router.createUrlTree([dest]);
};
