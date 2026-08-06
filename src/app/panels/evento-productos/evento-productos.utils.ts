import { Producto } from '../../types';
import {
  ProductoBadge,
  ProductoRecomendacion,
  ProductoStockStatus,
  ProductosResumen,
} from './evento-productos.types';

export function getDisponibles(producto: Producto): number {
  if (producto.cantidad_disponibles != null) {
    return Math.max(0, producto.cantidad_disponibles);
  }
  const total = producto.cantidad_total ?? 0;
  const vendidas = producto.cantidad_vendidas ?? 0;
  return Math.max(0, total - vendidas);
}

export function computeVendidoPct(producto: Producto): number {
  const total = producto.cantidad_total ?? 0;
  if (total <= 0) {
    return 0;
  }
  const vendidas = producto.cantidad_vendidas ?? 0;
  return Math.min(100, Math.round((vendidas / total) * 100));
}

export function computeIngresoPotencial(producto: Producto): number {
  const precio = Number(producto.precio ?? 0);
  const disponibles = getDisponibles(producto);
  if (!Number.isFinite(precio) || precio < 0) {
    return 0;
  }
  return precio * disponibles;
}

export function computeProductosResumen(productos: Producto[]): ProductosResumen {
  const productosCount = productos.length;
  const activos = productos.filter((p) => p.activo !== false).length;
  const unidades = productos.reduce((sum, p) => sum + (p.cantidad_total ?? 0), 0);
  const vendidas = productos.reduce((sum, p) => sum + (p.cantidad_vendidas ?? 0), 0);
  const potencialIngresos = productos.reduce((sum, p) => sum + computeIngresoPotencial(p), 0);

  return {
    productosCount,
    potencialIngresos,
    unidades,
    vendidas,
    activos,
  };
}

export function getProductoBadge(producto: Producto): ProductoBadge {
  if (producto.activo === false) {
    return 'inactivo';
  }
  const disponibles = getDisponibles(producto);
  if (disponibles <= 0) {
    return 'sin_stock';
  }
  if (computeVendidoPct(producto) >= 80) {
    return 'stock_bajo';
  }
  return 'activo';
}

export function getProductoStockStatus(producto: Producto): ProductoStockStatus {
  const badge = getProductoBadge(producto);
  switch (badge) {
    case 'sin_stock':
      return 'sin_stock';
    case 'stock_bajo':
      return 'bajo';
    default:
      return 'suficiente';
  }
}

export function hasPrecioEventoDistinto(producto: Producto): boolean {
  const preventa = Number(producto.precio ?? 0);
  const evento = Number(producto.precio_evento ?? producto.precio ?? 0);
  return Number.isFinite(preventa) && Number.isFinite(evento) && preventa !== evento;
}

export function getProductoRecomendacion(productos: Producto[]): ProductoRecomendacion | null {
  if (productos.length === 0) {
    return {
      message: 'Aumenta los ingresos de tu evento agregando comida, bebidas o merchandising.',
      showCta: true,
    };
  }
  if (productos.length === 1) {
    return {
      message: 'Agregar bebidas suele aumentar el ticket promedio.',
      showCta: true,
    };
  }
  return null;
}
