import { Producto } from '../../types';

export type EventoProductosView = 'dashboard' | 'form' | 'inventory';

export interface EventoProductosPanelData {
  eventoId: number;
  eventoTitulo: string;
  /** Se invoca al guardar cambios sin cerrar el drawer (p. ej. actualizar checklist en Operaciones). */
  onChanged?: (result: EventoProductosDrawerResult) => void;
}

export interface EventoProductosDrawerResult {
  changed: boolean;
  productos?: Producto[];
}

export interface ProductosResumen {
  productosCount: number;
  potencialIngresos: number;
  unidades: number;
  vendidas: number;
  activos: number;
}

export type ProductoBadge = 'activo' | 'stock_bajo' | 'sin_stock' | 'inactivo';

export type ProductoStockStatus = 'suficiente' | 'bajo' | 'sin_stock';

export interface ProductoRecomendacion {
  message: string;
}
