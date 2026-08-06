/**
 * Métricas de la landing /organizadores.
 * Desacopladas del diseño para editarlas sin tocar la plantilla.
 */
export interface OrganizadoresMetrica {
  /** Valor grande mostrado (puede incluir sufijo +) */
  value: string;
  /** Etiqueta corta debajo del valor */
  label: string;
  /** Texto auxiliar opcional */
  hint?: string;
}

export const ORGANIZADORES_METRICAS: OrganizadoresMetrica[] = [
  { value: '2000+', label: 'Asistentes', hint: 'Personas que pasaron por puerta' },
  { value: '90%+', label: 'Escaneo exitoso', hint: 'Accesos validados sin fricción' },
  { value: 'En vivo', label: 'Operación', hint: 'Ventas y puerta al mismo tiempo' },
  { value: 'Presente', label: 'Soporte', hint: 'Acompañamiento durante el evento' },
];
