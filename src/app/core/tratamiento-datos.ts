import { TRATAMIENTO_DATOS_VERSION } from '../constants/tratamiento-datos.constants';
import { Usuario } from '../types/entities';

export function usuarioTieneConsentimientoDatos(usuario: Usuario | null | undefined): boolean {
  if (!usuario) {
    return false;
  }
  return usuario.tratamiento_datos_aceptado === true;
}

export function consentimientoDatosPendiente(usuario: Usuario | null | undefined): boolean {
  return !usuarioTieneConsentimientoDatos(usuario);
}

export function datosConsentimientoParaGuardar(): Pick<
  Usuario,
  'tratamiento_datos_aceptado' | 'tratamiento_datos_fecha' | 'tratamiento_datos_version'
> {
  return {
    tratamiento_datos_aceptado: true,
    tratamiento_datos_fecha: new Date().toISOString(),
    tratamiento_datos_version: TRATAMIENTO_DATOS_VERSION,
  };
}
