/* ============================================
   TYPES - Exportación centralizada de tipos
   ============================================ */

// Exportar todos los enums
export * from './enums';

// Exportar todas las entidades
export * from './entities';

// Tipos auxiliares y utilidades
export type ID = number;
export type UUID = string;
export type Timestamp = Date | string;

/**
 * Respuesta genérica de API
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  errors?: Record<string, string[]>;
}

/**
 * Respuesta paginada
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Filtros genéricos para búsquedas
 */
export interface BaseFilters {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Filtros para eventos
 */
export interface EventoFilters extends BaseFilters {
  categoria_id?: number;
  organizador_id?: number;
  estado?: string;
  destacado?: boolean;
  fecha_inicio?: Date | string;
  fecha_fin?: Date | string;
  activo?: boolean;
}

/**
 * Filtros para compras
 */
export interface CompraFilters extends BaseFilters {
  cliente_id?: number;
  evento_id?: number;
  estado_pago?: string;
  estado_compra?: string;
  fecha_desde?: Date | string;
  fecha_hasta?: Date | string;
}

/**
 * Filtros para boletas
 */
export interface BoletaFilters extends BaseFilters {
  compra_id?: number;
  evento_id?: number;
  tipo_boleta_id?: number;
  estado?: string;
}

/**
 * Estadísticas del dashboard
 */
export interface DashboardStats {
  eventos_activos: number;
  boletas_vendidas: number;
  ingresos_totales: number;
  clientes: number;
  ventas_recientes?: any[];
  eventos_proximos?: any[];
  eventos_totales?: number;
  categorias_activas?: number;
  lugares_activos?: number;
  ingresos_mes_actual?: number;
  ingresos_mes_anterior?: number;
  boletas_por_estado?: { estado: string; cantidad: number }[];
  eventos_por_categoria?: { categoria: string; cantidad: number }[];
  top_eventos?: any[];
}

