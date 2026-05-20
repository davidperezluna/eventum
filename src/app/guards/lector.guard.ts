import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

const LECTOR_RUTAS_PERMITIDAS = new Set(['', 'inicio', 'validar']);

/** Solo hijos permitidos bajo /lector (inicio, validar). */
export const lectorChildGuard: CanActivateFn = (route) => {
  const router = inject(Router);
  const path = route.routeConfig?.path ?? '';
  if (!LECTOR_RUTAS_PERMITIDAS.has(path)) {
    router.navigate(['/lector/inicio']);
    return false;
  }
  return true;
};

/** Si hay sesión lector, no puede usar rutas públicas/panel (solo /lector/*). */
export const lectorFueraDeAppGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await authService.waitForInitialization();

  if (authService.isAuthenticated() && authService.isLector()) {
    router.navigate(['/lector/inicio']);
    return false;
  }

  return true;
};

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

