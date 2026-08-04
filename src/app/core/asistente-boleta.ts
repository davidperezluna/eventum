import { esDocumentoIdentidadColombiaValido } from './documento-identidad';

/** Perfil mínimo del usuario asistente (join desde boletas_compradas). */
export interface UsuarioAsistenteResumen {
  id?: number;
  nombre?: string | null;
  apellido?: string | null;
  email?: string | null;
  telefono?: string | null;
  documento_identidad?: string | null;
}

export interface BoletaConAsistenteUsuario {
  asistente_usuario_id?: number | null;
  asistente_usuario?: UsuarioAsistenteResumen | UsuarioAsistenteResumen[] | null;
}

export function nombreCompletoUsuario(
  nombre?: string | null,
  apellido?: string | null,
): string {
  return [nombre, apellido].filter((p) => !!String(p ?? '').trim()).join(' ').trim();
}

export function nombreDisplayUsuario(
  usuario: Pick<UsuarioAsistenteResumen, 'nombre' | 'apellido' | 'email'> | null | undefined,
): string {
  const nombre = nombreCompletoUsuario(usuario?.nombre, usuario?.apellido);
  if (nombre) return nombre;
  return String(usuario?.email ?? '').trim();
}

export function normalizarAsistenteUsuario(
  raw: UsuarioAsistenteResumen | UsuarioAsistenteResumen[] | null | undefined,
): UsuarioAsistenteResumen | null {
  if (!raw) {
    return null;
  }
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

export function usuarioAsistenteDeBoleta(
  boleta: BoletaConAsistenteUsuario | null | undefined,
): UsuarioAsistenteResumen | null {
  if (!boleta) {
    return null;
  }
  const embebido = normalizarAsistenteUsuario(boleta.asistente_usuario);
  if (embebido) {
    return embebido;
  }
  const id = boleta.asistente_usuario_id;
  if (id != null && id > 0) {
    return { id };
  }
  return null;
}

/** Perfil del asistente: join embebido o, si falta, el usuario en sesión cuando coincide el id. */
export function resolverPerfilAsistenteBoleta(
  boleta: BoletaConAsistenteUsuario | null | undefined,
  perfilSesion?: UsuarioAsistenteResumen | null,
): UsuarioAsistenteResumen | null {
  const embebido = usuarioAsistenteDeBoleta(boleta);
  if (embebido && perfilTieneDatosAsistente(embebido)) {
    return embebido;
  }
  const id = boleta?.asistente_usuario_id;
  if (id != null && id > 0 && perfilSesion?.id === id && perfilTieneDatosAsistente(perfilSesion)) {
    return perfilSesion;
  }
  return embebido;
}

function perfilTieneDatosAsistente(usuario: UsuarioAsistenteResumen): boolean {
  return !!(
    nombreCompletoUsuario(usuario.nombre, usuario.apellido)
    || String(usuario.documento_identidad ?? '').trim()
    || String(usuario.email ?? '').trim()
  );
}

export function tieneAsistenteUsuarioEnlazado(
  boleta: BoletaConAsistenteUsuario | null | undefined,
): boolean {
  const id = boleta?.asistente_usuario_id;
  return id != null && id > 0;
}

export function nombreAsistenteDesdeUsuario(
  usuario: UsuarioAsistenteResumen | null | undefined,
): string {
  if (!usuario) {
    return '';
  }
  return nombreDisplayUsuario(usuario as Parameters<typeof nombreDisplayUsuario>[0]);
}

export function documentoAsistenteDesdeUsuario(
  usuario: UsuarioAsistenteResumen | null | undefined,
): string {
  return String(usuario?.documento_identidad ?? '').trim();
}

export function emailAsistenteDesdeUsuario(
  usuario: UsuarioAsistenteResumen | null | undefined,
): string {
  return String(usuario?.email ?? '').trim();
}

export function telefonoAsistenteDesdeUsuario(
  usuario: UsuarioAsistenteResumen | null | undefined,
): string {
  return String(usuario?.telefono ?? '').trim();
}

export function nombreAsistenteBoleta(
  boleta: BoletaConAsistenteUsuario | null | undefined,
  perfilSesion?: UsuarioAsistenteResumen | null,
): string {
  const usuario = resolverPerfilAsistenteBoleta(boleta, perfilSesion);
  const nombre = nombreAsistenteDesdeUsuario(usuario);
  return nombre || '—';
}

export function documentoAsistenteBoleta(
  boleta: BoletaConAsistenteUsuario | null | undefined,
  perfilSesion?: UsuarioAsistenteResumen | null,
): string {
  const doc = documentoAsistenteDesdeUsuario(resolverPerfilAsistenteBoleta(boleta, perfilSesion));
  return doc || '—';
}

/** Perfil del asistente enlazado listo para puerta / QR. */
export function tieneAsistenteUsuarioValido(
  boleta: BoletaConAsistenteUsuario | null | undefined,
  perfilSesion?: UsuarioAsistenteResumen | null,
): boolean {
  const usuario = resolverPerfilAsistenteBoleta(boleta, perfilSesion);
  if (!usuario) {
    return false;
  }
  const nombre = nombreCompletoUsuario(usuario.nombre, usuario.apellido);
  if (!nombre) {
    return false;
  }
  return esDocumentoIdentidadColombiaValido(String(usuario.documento_identidad ?? ''));
}
