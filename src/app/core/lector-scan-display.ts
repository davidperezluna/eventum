import { BoletaComprada } from '../types';
import {
  documentoAsistenteBoleta,
  nombreAsistenteBoleta,
} from './asistente-boleta';
import { BoletaCoverEscaneo } from '../types/covers';

export { nombreCompletoUsuario, nombreDisplayUsuario } from './asistente-boleta';

export function nombreAsistenteBoletaEscaneo(boleta: BoletaComprada | null | undefined): string {
  if (!boleta) return '—';
  const nombre = nombreAsistenteBoleta(boleta);
  return nombre === '—' ? '—' : nombre;
}

export function documentoAsistenteBoletaEscaneo(boleta: BoletaComprada | null | undefined): string {
  if (!boleta) return '—';
  const doc = documentoAsistenteBoleta(boleta);
  return doc === '—' ? '—' : doc;
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
