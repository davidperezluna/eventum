import { EVENTUM_CONTACTO } from './contacto.constants';

/** Versión de la política / autorización mostrada al usuario. */
export const TRATAMIENTO_DATOS_VERSION = 'col-2026-02';

export const TRATAMIENTO_DATOS_TITULO = 'Tratamiento de datos personales';

export const TRATAMIENTO_DATOS_RESUMEN =
  'Usamos tus datos para administrar tu cuenta, procesar compras y validar accesos en eventos.';

export const TRATAMIENTO_DATOS_CHECKBOX =
  'Acepto el tratamiento de mis datos personales conforme a la Ley 1581 de 2012 y normas complementarias.';

export const TRATAMIENTO_DATOS_LINEAS: readonly string[] = [
  `Responsable: Eventum. Consultas: ${EVENTUM_CONTACTO.email}.`,
  'Usamos nombre, documento, teléfono, fecha de nacimiento y género para tu cuenta, compras, entradas y notificaciones.',
  'Podemos compartir datos con organizadores y proveedores del servicio (pagos, autenticación) bajo confidencialidad.',
  'Puedes conocer, actualizar, rectificar o suprimir tus datos, y revocar esta autorización escribiendo a Eventum o a la SIC.',
];
