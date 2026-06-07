import { environment } from '../../environments/environment';

/**
 * Módulo Covers Eventum (cover recurrente, aforo, reingreso por lugar).
 * `environment.coversEventumEnabled === true` → rutas y UI visibles.
 */
export const coversEventumEnabled = environment.coversEventumEnabled === true;
