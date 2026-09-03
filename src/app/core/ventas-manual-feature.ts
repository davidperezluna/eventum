import { environment } from '../../environments/environment';

/**
 * Módulo Venta manual (cobro directo al organizador, sin pasarela).
 * `environment.ventasManualEnabled === true` → ruta y menú visibles.
 */
export const ventasManualEnabled = environment.ventasManualEnabled === true;
