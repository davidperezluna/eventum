import { environment } from '../../environments/environment';

/**
 * Módulo Cupos Eventum (tablón, explorar, mis publicaciones).
 * `environment.cuposEventumEnabled === true` → rutas y UI visibles.
 */
export const cuposEventumEnabled = environment.cuposEventumEnabled === true;
