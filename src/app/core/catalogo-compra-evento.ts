import { EstadoPalco, Evento, Palco, Producto, TipoBoleta, TipoEstadoEvento } from '../types';

/** Normaliza tipos activos igual que detalle-evento (disponibles + orden agotados al final). */
export function normalizarTiposBoletaActivos(tipos: TipoBoleta[]): TipoBoleta[] {
  return (tipos || [])
    .filter((t) => t.activo)
    .map((t) => {
      const vendidas = Number(t.cantidad_vendidas ?? 0);
      const total = Number(t.cantidad_total ?? 0);
      const disponiblesCalculados = Number.isFinite(total) ? Math.max(0, total - vendidas) : 0;
      const rawDisponibles = Number(t.cantidad_disponibles);
      const disponibles =
        t.cantidad_disponibles === null ||
        t.cantidad_disponibles === undefined ||
        !Number.isFinite(rawDisponibles)
          ? disponiblesCalculados
          : Math.max(0, rawDisponibles);
      return { ...t, cantidad_disponibles: disponibles };
    })
    .sort((a, b) => {
      const aSoldOut = Number(a.cantidad_disponibles ?? 0) <= 0;
      const bSoldOut = Number(b.cantidad_disponibles ?? 0) <= 0;
      if (aSoldOut === bSoldOut) return 0;
      return aSoldOut ? 1 : -1;
    });
}

export function cuposPorPalcoTipo(tipo: TipoBoleta): number {
  return Math.max(1, Number(tipo.personas_por_unidad ?? 1));
}

export function esLineaPalcoMultipersonaTipo(tipo: TipoBoleta): boolean {
  return cuposPorPalcoTipo(tipo) > 1;
}

export function descripcionTipoBoletaVisible(tipo: TipoBoleta): boolean {
  const descripcion = (tipo.descripcion || '').trim();
  if (!descripcion) return false;
  const nombre = (tipo.nombre || '').trim();
  return descripcion.localeCompare(nombre, 'es', { sensitivity: 'accent' }) !== 0;
}

/** Fin de venta por etapa: solo si el evento no muestra venta en línea global. */
export function mostrarFinVentaTipoBoleta(evento: Evento | null, tipo: TipoBoleta): boolean {
  if (!evento) return false;
  if (evento.fecha_venta_inicio || evento.fecha_venta_fin) return false;
  return !!tipo.fecha_venta_fin;
}

export function cantidadPalcosReservadosTipo(
  tipo: TipoBoleta,
  palcosCatalogoPorTipo: Map<number, Palco[]>,
): number {
  if (esLineaPalcoMultipersonaTipo(tipo)) {
    const catalogo = palcosCatalogoPorTipo.get(tipo.id) ?? [];
    return catalogo.filter((p) => String(p.estado).toLowerCase() === EstadoPalco.RESERVADO).length;
  }
  const total = Number(tipo.cantidad_total ?? 0);
  const vendidas = Number(tipo.cantidad_vendidas ?? 0);
  const disponibles = Number(tipo.cantidad_disponibles ?? 0);
  return Math.max(0, total - vendidas - disponibles);
}

export function tiposBoletaConExistencias(
  tipos: TipoBoleta[],
  maxCantidadFn: (tipo: TipoBoleta) => number,
): TipoBoleta[] {
  return tipos.filter((t) => maxCantidadFn(t) > 0);
}

export function tiposBoletaAgotados(
  tipos: TipoBoleta[],
  maxCantidadFn: (tipo: TipoBoleta) => number,
): TipoBoleta[] {
  return tipos.filter((t) => maxCantidadFn(t) <= 0);
}

export function eventoCompraFinalizado(evento: Evento): boolean {
  const ahora = new Date();
  const fechaFin = new Date(evento.fecha_fin);
  return (
    evento.estado === TipoEstadoEvento.FINALIZADO ||
    evento.estado === TipoEstadoEvento.CANCELADO ||
    fechaFin < ahora
  );
}

export function getDisponiblesProducto(producto: Producto): number {
  return producto.cantidad_disponibles ?? Math.max(0, producto.cantidad_total - (producto.cantidad_vendidas ?? 0));
}

export function maxCantidadProductoPermitida(producto: Producto): number {
  const disponibles = getDisponiblesProducto(producto);
  const limite = producto.limite_por_persona;
  if (limite != null && limite > 0) {
    return Math.min(disponibles, limite);
  }
  return disponibles;
}

export function productoTieneExistencias(producto: Producto): boolean {
  return maxCantidadProductoPermitida(producto) > 0;
}
