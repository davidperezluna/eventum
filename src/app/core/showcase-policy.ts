import { TipoEstadoEvento } from '../types';

/** Rutas globales bloqueadas para la cuenta Eventum Showcase (acceso directo por URL). */
export const SHOWCASE_BLOCKED_ROUTES = new Set([
  'usuarios',
  'categorias',
  'lugares',
  'notificaciones',
  'covers-config',
  'ventas',
  'ventas-productos',
  'ventas-palcos',
  'transacciones-checkout',
  'wompi-reconcile',
  'probar-compras',
  'ventas-manual',
  'calificaciones',
  'reportes',
]);

export function isShowcaseBlockedRoute(segments: string[]): boolean {
  if (segments.length === 0) {
    return false;
  }
  return SHOWCASE_BLOCKED_ROUTES.has(segments[0]);
}

export function applyShowcaseEventoPolicy<T extends {
  estado?: string;
  activo?: boolean;
  wompi_cuenta_id?: number | null;
}>(evento: T): T {
  return {
    ...evento,
    estado: TipoEstadoEvento.BORRADOR,
    activo: false,
    wompi_cuenta_id: null,
  };
}
