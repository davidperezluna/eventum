import { BoletaCoverCliente, CompraCoverCliente } from '../types/covers';
import { TipoEstadoPago } from '../types';

export interface CoverAccesoPuertaItem {
  compra: CompraCoverCliente;
  boleta: BoletaCoverCliente;
  esCedida?: boolean;
}

export interface CoverAccesoPuertaContext {
  usuarioId: number | null;
  trasladoSalienteBoletaCoverIds: Set<number>;
}

export function diaCalendarioLocal(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

export function coverAccesoUtilizadoEnPuerta(boleta: BoletaCoverCliente): boolean {
  const acceso = (boleta.estado_acceso || '').toLowerCase();
  return acceso !== '' && acceso !== 'pendiente';
}

export function esBoletaCoverUsada(boleta: BoletaCoverCliente): boolean {
  const estado = (boleta.estado || '').toLowerCase();
  const acceso = (boleta.estado_acceso || '').toLowerCase();
  if (estado === 'consumida' || estado === 'cancelada' || acceso === 'consumida') {
    return true;
  }
  if (acceso === 'fuera' && boleta.permite_reingreso === false) {
    return true;
  }
  return false;
}

export function esDiaSesionCover(boleta: BoletaCoverCliente): boolean {
  if (!boleta.sesion_fecha) return true;
  const sesion = new Date(`${boleta.sesion_fecha}T12:00:00`);
  if (Number.isNaN(sesion.getTime())) return true;
  const hoy = diaCalendarioLocal(new Date());
  const diaSesion = diaCalendarioLocal(sesion);
  return hoy === diaSesion;
}

export function esTitularCover(item: CoverAccesoPuertaItem, uid: number | null): boolean {
  if (!uid) return false;
  const titular = item.boleta.titular_cliente_id ?? item.compra.cliente_id ?? item.boleta.compra_cliente_id;
  return titular === uid;
}

export function tieneTrasladoSalienteCoverActivo(
  boletaCoverId: number,
  trasladoSalienteIds: Set<number>
): boolean {
  return trasladoSalienteIds.has(Number(boletaCoverId));
}

export function puedeAbrirQrCover(
  item: CoverAccesoPuertaItem,
  ctx: CoverAccesoPuertaContext
): boolean {
  return (
    esTitularCover(item, ctx.usuarioId) &&
    item.compra.estado_pago === TipoEstadoPago.COMPLETADO &&
    !!item.boleta.codigo_qr?.trim() &&
    !esBoletaCoverUsada(item.boleta) &&
    !tieneTrasladoSalienteCoverActivo(item.boleta.id, ctx.trasladoSalienteBoletaCoverIds)
  );
}

export function puedeMostrarQrCover(
  item: CoverAccesoPuertaItem,
  ctx: CoverAccesoPuertaContext
): boolean {
  return puedeAbrirQrCover(item, ctx) && esDiaSesionCover(item.boleta);
}

export function esCoverAccesoPuertaActivo(
  item: CoverAccesoPuertaItem,
  ctx: CoverAccesoPuertaContext
): boolean {
  if (!puedeAbrirQrCover(item, ctx)) return false;
  if (!esDiaSesionCover(item.boleta)) return false;
  if (!coverAccesoUtilizadoEnPuerta(item.boleta)) return false;
  if (esBoletaCoverUsada(item.boleta)) return false;
  const acceso = (item.boleta.estado_acceso || '').toLowerCase();
  return acceso === 'dentro' || (acceso === 'fuera' && !!item.boleta.permite_reingreso);
}

export function filtrarAccesosPuertaActivos(
  items: CoverAccesoPuertaItem[],
  ctx: CoverAccesoPuertaContext
): CoverAccesoPuertaItem[] {
  return items
    .filter((item) => esCoverAccesoPuertaActivo(item, ctx))
    .sort((a, b) => {
      const prio = (item: CoverAccesoPuertaItem) =>
        accionCoverAccesoPuerta(item) === 'salida' ? 0 : 1;
      const byPrio = prio(a) - prio(b);
      if (byPrio !== 0) return byPrio;
      return (a.boleta.lugar_nombre || '').localeCompare(b.boleta.lugar_nombre || '', 'es');
    });
}

export function accionCoverAccesoPuerta(item: CoverAccesoPuertaItem): 'entrada' | 'salida' {
  return (item.boleta.estado_acceso || '').toLowerCase() === 'dentro' ? 'salida' : 'entrada';
}

export function labelBotonQrCover(item: CoverAccesoPuertaItem): string {
  if ((item.boleta.estado_acceso || '').toLowerCase() === 'dentro') {
    return 'QR para salir';
  }
  if (coverAccesoUtilizadoEnPuerta(item.boleta)) {
    return 'QR para entrar';
  }
  return 'Ver QR';
}

export function iconoBotonQrCover(item: CoverAccesoPuertaItem): string {
  if ((item.boleta.estado_acceso || '').toLowerCase() === 'dentro') {
    return 'logout';
  }
  if (coverAccesoUtilizadoEnPuerta(item.boleta)) {
    return 'login';
  }
  return 'qr_code_2';
}

export function getEstadoCoverLabel(boleta: BoletaCoverCliente): string {
  if (esBoletaCoverUsada(boleta)) return 'Usada';
  if (boleta.estado_acceso === 'dentro') return 'Dentro';
  if (boleta.estado_acceso === 'fuera' && boleta.permite_reingreso) return 'Fuera · reingreso';
  if (boleta.estado_acceso === 'fuera') return 'Salió';
  return 'Sin usar';
}

export function getEstadoCoverClass(boleta: BoletaCoverCliente): string {
  if (esBoletaCoverUsada(boleta)) return 'badge-warning';
  if (boleta.estado_acceso === 'dentro') return 'badge-success';
  if (boleta.estado_acceso === 'fuera') return 'badge-info';
  return 'badge-info-soft';
}

export function hintQrCoverAcceso(item: CoverAccesoPuertaItem | null): string {
  if (!item || !coverAccesoUtilizadoEnPuerta(item.boleta)) {
    return 'Presenta este código en la puerta del club.';
  }
  return accionCoverAccesoPuerta(item) === 'salida'
    ? 'Estás dentro del club. Presenta este código en la puerta para registrar tu salida.'
    : 'Presenta este código en la puerta para volver a entrar al club.';
}

export function parseHoraCoverToMinutes(hora: string | null | undefined): number | null {
  if (!hora?.trim()) return null;
  const parts = hora.trim().split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1] ?? 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/** Porcentaje de avance de la sesión (0–100) según hora local. */
export function sesionProgresoCover(boleta: BoletaCoverCliente, now = new Date()): number {
  const apertura = parseHoraCoverToMinutes(boleta.sesion_hora_apertura);
  const cierre = parseHoraCoverToMinutes(boleta.sesion_hora_cierre);
  if (apertura == null || cierre == null) return 35;

  let start = apertura;
  let end = cierre;
  if (end <= start) {
    end += 24 * 60;
  }

  let current = now.getHours() * 60 + now.getMinutes();
  if (end > 24 * 60 && current < start) {
    current += 24 * 60;
  }
  if (current <= start) return 0;
  if (current >= end) return 100;
  return Math.round(((current - start) / (end - start)) * 100);
}

export function minutosRestantesSesionCover(
  boleta: BoletaCoverCliente,
  now = new Date()
): number | null {
  const apertura = parseHoraCoverToMinutes(boleta.sesion_hora_apertura);
  const cierre = parseHoraCoverToMinutes(boleta.sesion_hora_cierre);
  if (cierre == null) return null;

  let end = cierre;
  if (apertura != null && cierre <= apertura) {
    end += 24 * 60;
  }

  let current = now.getHours() * 60 + now.getMinutes();
  if (apertura != null && cierre <= apertura && current < apertura) {
    current += 24 * 60;
  }
  const diff = end - current;
  return diff > 0 ? diff : 0;
}

export function labelTiempoRestanteSesionCover(
  boleta: BoletaCoverCliente,
  now = new Date()
): string {
  const mins = minutosRestantesSesionCover(boleta, now);
  if (mins == null) return 'Noche en curso';
  if (mins === 0) return 'Sesión por cerrar';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `Cierra en ${h}h ${m}m`;
  if (h > 0) return `Cierra en ${h}h`;
  return `Cierra en ${m} min`;
}

export function mensajeEstadoPuerta(item: CoverAccesoPuertaItem): string {
  const acceso = (item.boleta.estado_acceso || '').toLowerCase();
  if (acceso === 'dentro') {
    return 'Estás dentro · muestra el QR al salir';
  }
  if (acceso === 'fuera' && item.boleta.permite_reingreso) {
    return 'Fuera del club · listo para reingresar';
  }
  return 'Acceso activo en puerta';
}
