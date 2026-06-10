import { BoletaComprada } from '../types';
import { Usuario } from '../types/entities';
import { BoletaCoverEscaneo } from '../types/covers';

export function nombreCompletoUsuario(
  nombre?: string | null,
  apellido?: string | null,
): string {
  return [nombre, apellido].filter((p) => !!String(p ?? '').trim()).join(' ').trim();
}

export function nombreDisplayUsuario(
  usuario: Pick<Usuario, 'nombre' | 'apellido' | 'email'> | null | undefined,
): string {
  const nombre = nombreCompletoUsuario(usuario?.nombre, usuario?.apellido);
  if (nombre) return nombre;
  return String(usuario?.email ?? '').trim();
}

export function nombreAsistenteBoletaEscaneo(boleta: BoletaComprada | null | undefined): string {
  if (!boleta) return '—';
  const directo = String(boleta.nombre_asistente ?? '').trim();
  if (directo) return directo;
  const display = String(boleta.asistente_display_nombre ?? '').trim();
  if (display) return display;
  const email = String(boleta.asistente_display_email ?? '').trim();
  if (email) return email;
  return '—';
}

export function documentoAsistenteBoletaEscaneo(boleta: BoletaComprada | null | undefined): string {
  if (!boleta) return '—';
  const directo = String(boleta.documento_asistente ?? '').trim();
  if (directo) return directo;
  const display = String(boleta.asistente_display_documento ?? '').trim();
  if (display) return display;
  return '—';
}

export function nombreAsistenteProductoEscaneo(
  item: { compra?: { nombre_cliente?: string | null } | null } | null | undefined,
): string {
  if (!item?.compra) return '—';
  const nombre = String(item.compra.nombre_cliente ?? '').trim();
  return nombre || '—';
}

export function nombreAsistenteCoverEscaneo(cover: BoletaCoverEscaneo | null | undefined): string {
  if (!cover) return '—';
  const nombre = String(cover.titular_nombre ?? '').trim();
  if (nombre) return nombre;
  return '—';
}

export function documentoAsistenteCoverEscaneo(cover: BoletaCoverEscaneo | null | undefined): string {
  if (!cover) return '—';
  const doc = String(cover.titular_documento ?? '').trim();
  return doc || '—';
}
