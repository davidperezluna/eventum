import { BoletaComprada } from '../types';
import { BoletaCoverEscaneo } from '../types/covers';

export function nombreCompletoUsuario(
  nombre?: string | null,
  apellido?: string | null,
): string {
  return [nombre, apellido].filter((p) => !!String(p ?? '').trim()).join(' ').trim();
}

export function nombreAsistenteBoletaEscaneo(boleta: BoletaComprada | null | undefined): string {
  if (!boleta) return '—';
  const directo = String(boleta.nombre_asistente ?? '').trim();
  if (directo) return directo;
  const display = String(boleta.asistente_display_nombre ?? '').trim();
  if (display) return display;
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
  return nombre || '—';
}

export function documentoAsistenteCoverEscaneo(cover: BoletaCoverEscaneo | null | undefined): string {
  if (!cover) return '—';
  const doc = String(cover.titular_documento ?? '').trim();
  return doc || '—';
}
