import { TipoBoleta } from '../../types';
import { BoletasResumen, TipoBoletaBadge } from './evento-boletas.types';

export function computeOcupacionPct(tipo: TipoBoleta): number {
  const total = tipo.cantidad_total ?? 0;
  if (total <= 0) {
    return 0;
  }
  const vendidas = tipo.cantidad_vendidas ?? 0;
  return Math.min(100, Math.round((vendidas / total) * 100));
}

export function computeBoletasResumen(tipos: TipoBoleta[]): BoletasResumen {
  const activos = tipos.filter((t) => t.activo !== false);
  const totalBoletas = activos.reduce((sum, t) => sum + (t.cantidad_total ?? 0), 0);
  const vendidas = activos.reduce((sum, t) => sum + (t.cantidad_vendidas ?? 0), 0);
  const ocupacionPct = totalBoletas > 0 ? Math.round((vendidas / totalBoletas) * 100) : 0;

  return {
    tiposCount: activos.length,
    totalBoletas,
    vendidas,
    ocupacionPct,
  };
}

export function getTipoBoletaBadge(tipo: TipoBoleta): TipoBoletaBadge | null {
  if (tipo.activo === false) {
    return 'inactiva';
  }
  const disponibles = tipo.cantidad_disponibles ?? 0;
  if (disponibles <= 0) {
    return 'agotada';
  }
  if (computeOcupacionPct(tipo) >= 80) {
    return 'agotandose';
  }
  return null;
}

export function isVentaActiva(tipo: TipoBoleta): boolean {
  return tipo.activo !== false && (tipo.cantidad_disponibles ?? 0) > 0;
}

/** Activa → inactiva; dentro de cada grupo, con venta → sin venta; luego por nombre. */
export function sortTiposBoletaPanel(tipos: TipoBoleta[]): TipoBoleta[] {
  return [...tipos].sort((a, b) => {
    const aActivo = a.activo !== false ? 0 : 1;
    const bActivo = b.activo !== false ? 0 : 1;
    if (aActivo !== bActivo) {
      return aActivo - bActivo;
    }

    const aVenta = isVentaActiva(a) ? 0 : 1;
    const bVenta = isVentaActiva(b) ? 0 : 1;
    if (aVenta !== bVenta) {
      return aVenta - bVenta;
    }

    return (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' });
  });
}

export function ventaStatusLabel(tipo: TipoBoleta): string {
  if (tipo.activo === false) {
    return 'No está a la venta';
  }
  if ((tipo.cantidad_disponibles ?? 0) <= 0) {
    return 'Se agotó';
  }
  return 'En venta';
}

export function getPalcoLabel(tipo: TipoBoleta): string | null {
  const personas = tipo.personas_por_unidad ?? 1;
  if (tipo.es_palco || personas > 1) {
    return personas > 1 ? `Palco · ${personas} pers.` : 'Palco';
  }
  return null;
}
