import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { cuposEventumEnabled } from '../core/cupos-feature';

/** Bloquea rutas del módulo cupos cuando el feature flag está desactivado. */
export const cuposFeatureGuard: CanActivateFn = () => {
  if (cuposEventumEnabled) {
    return true;
  }
  return inject(Router).createUrlTree(['/eventos-cliente']);
};
