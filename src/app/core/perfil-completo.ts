import { esDocumentoIdentidadColombiaValido } from './documento-identidad';
import { esFechaNacimientoUsuarioValida } from './fecha-nacimiento';
import { esTelefonoColombiaValido } from './telefono-colombia';
import { TipoGenero } from '../types/enums';
import { Usuario } from '../types/entities';
import { usuarioTieneConsentimientoDatos } from './tratamiento-datos';

export type CampoPerfilRequerido =
  | 'nombre'
  | 'apellido'
  | 'documento_identidad'
  | 'telefono'
  | 'fecha_nacimiento'
  | 'genero';

export function esGeneroUsuarioValido(genero: TipoGenero | string | undefined | null): boolean {
  const value = String(genero ?? '').trim();
  return (
    value === TipoGenero.MASCULINO ||
    value === TipoGenero.FEMENINO ||
    value === TipoGenero.OTRO
  );
}

export function camposPerfilFaltantes(usuario: Usuario | null | undefined): CampoPerfilRequerido[] {
  if (!usuario) {
    return ['nombre', 'apellido', 'documento_identidad', 'telefono', 'fecha_nacimiento', 'genero'];
  }

  const faltantes: CampoPerfilRequerido[] = [];
  if (!String(usuario.nombre ?? '').trim()) {
    faltantes.push('nombre');
  }
  if (!String(usuario.apellido ?? '').trim()) {
    faltantes.push('apellido');
  }
  if (!esDocumentoIdentidadColombiaValido(String(usuario.documento_identidad ?? ''))) {
    faltantes.push('documento_identidad');
  }
  if (!esTelefonoColombiaValido(String(usuario.telefono ?? ''))) {
    faltantes.push('telefono');
  }
  if (!esFechaNacimientoUsuarioValida(usuario.fecha_nacimiento)) {
    faltantes.push('fecha_nacimiento');
  }
  if (!esGeneroUsuarioValido(usuario.genero)) {
    faltantes.push('genero');
  }
  return faltantes;
}

export function perfilListoParaComprar(usuario: Usuario | null | undefined): boolean {
  return camposPerfilFaltantes(usuario).length === 0 && usuarioTieneConsentimientoDatos(usuario);
}

export function esClienteConPerfilIncompleto(usuario: Usuario | null | undefined): boolean {
  return !!usuario && usuario.tipo_usuario_id === 1 && !perfilListoParaComprar(usuario);
}

/** Tras login o navegación: manda a completar perfil si el cliente aún no tiene datos obligatorios. */
export function urlDestinoClienteConPerfil(
  usuario: Usuario | null | undefined,
  destino: string
): string {
  if (!esClienteConPerfilIncompleto(usuario)) {
    return destino;
  }

  const destinoLimpio = (destino || '/eventos-cliente').trim().split('?')[0] || '/eventos-cliente';
  if (destinoLimpio === '/completar-perfil') {
    return '/completar-perfil';
  }

  const params = new URLSearchParams();
  params.set('returnUrl', destinoLimpio);
  return `/completar-perfil?${params.toString()}`;
}

export function esRutaExentaCompletarPerfil(path: string): boolean {
  const normalizada = (path || '').trim().split('?')[0];
  return (
    normalizada === '/completar-perfil' ||
    normalizada === '/pago-resultado' ||
    normalizada === '/login' ||
    normalizada === '/register' ||
    normalizada.startsWith('/auth/callback')
  );
}
