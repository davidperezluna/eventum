/** Tipos del módulo Covers Eventum (RPC / tablas). */

export type EstadoSesionCover = 'programada' | 'abierta' | 'cerrada' | 'cancelada';

export type EstadoAccesoCover = 'pendiente' | 'dentro' | 'fuera' | 'consumida';

/** Cobro offline al vender/asignar covers en puerta. */
export type MetodoPagoCoverManual = 'efectivo' | 'transferencia' | 'tarjeta' | 'cortesia';

export interface VentaCoverManualResult {
  ok: boolean;
  compra_cover_id: number;
  numero_transaccion: string;
  metodo_pago: string;
  total: number;
  cantidad: number;
  cliente_id: number;
  boletas_cover: Array<{ id: number; codigo_qr: string; sesion_cover_id: number }>;
}

export interface UsuarioCoverVenta {
  id: number;
  nombre?: string | null;
  apellido?: string | null;
  email: string;
  documento_identidad?: string | null;
  activo?: boolean;
}

export interface ResumenNocheCover {
  sesion_cover_id: number;
  fecha: string;
  estado: EstadoSesionCover;
  aforo_maximo: number;
  personas_dentro: number;
  cantidad_vendida: number;
  porcentaje_servicio_config: number;
  covers_activos: number;
  app_covers: number;
  app_ingresos: number;
  app_servicio_eventum: number;
  puerta_covers: number;
  puerta_ingresos: number;
  puerta_por_metodo: Record<string, number>;
  cortesias: number;
  ingresos_totales: number;
  nota_servicio?: string;
}

export interface VentaNocheCoverItem {
  boleta_id: number;
  codigo_qr: string;
  precio_unitario: number;
  boleta_estado: string;
  estado_acceso: EstadoAccesoCover;
  fecha_creacion?: string;
  compra_id: number;
  numero_transaccion: string;
  fecha_compra: string;
  compra_total: number;
  valor_servicio: number;
  metodo_pago: string | null;
  origen_venta: 'online' | 'manual' | string;
  notas?: string | null;
  vendido_por_usuario_id?: number | null;
  vendido_por_nombre?: string | null;
  vendido_por_email?: string | null;
  cliente_id?: number | null;
  cliente_nombre?: string | null;
  cliente_email?: string | null;
  cliente_documento?: string | null;
  tipo_cover_nombre?: string;
}

export interface PersonaDentroCover {
  boleta_id: number;
  codigo_qr: string;
  estado_acceso: string;
  ultima_entrada_at?: string | null;
  entradas_count?: number;
  cliente_id?: number | null;
  cliente_nombre?: string | null;
  cliente_email?: string | null;
  cliente_documento?: string | null;
  tipo_cover_nombre?: string;
}

export interface AccesoCoverItem {
  id: number;
  tipo_movimiento: 'entrada' | 'salida' | string;
  fecha_creacion: string;
  personas_dentro_despues?: number;
  codigo_qr?: string;
  cliente_nombre?: string | null;
  cliente_documento?: string | null;
}

export interface LugarCoverConfig {
  id: number;
  nombre: string;
  direccion?: string;
  ciudad?: string;
  capacidad_maxima?: number;
  covers_habilitado?: boolean;
  covers_descripcion?: string | null;
  covers_porcentaje_servicio?: number;
  /** Organizador responsable de covers en este lugar. */
  covers_organizador_id?: number | null;
  covers_organizador_nombre?: string | null;
  covers_organizador_email?: string | null;
  activo?: boolean;
}

export interface TipoCover {
  id: number;
  lugar_id: number;
  organizador_id: number;
  nombre: string;
  descripcion?: string | null;
  precio_cop: number;
  permite_reingreso: boolean;
  limite_por_persona?: number | null;
  orden?: number;
  activo: boolean;
  evento_id?: number | null;
  tipo_boleta_id?: number | null;
  wompi_cuenta_id?: number | null;
  evento_titulo?: string | null;
  tipo_boleta_nombre?: string | null;
  fecha_creacion?: string;
  fecha_actualizacion?: string;
}

export interface PlantillaCover {
  id: number;
  tipo_cover_id: number;
  lugar_id: number;
  dia_semana: number;
  hora_apertura: string;
  hora_cierre: string;
  aforo_maximo?: number | null;
  cantidad_maxima_venta?: number | null;
  dias_anticipacion?: number;
  activo: boolean;
  tipo_cover_nombre?: string;
  fecha_creacion?: string;
  fecha_actualizacion?: string;
}

export interface SesionCover {
  id: number;
  plantilla_cover_id?: number | null;
  tipo_cover_id: number;
  lugar_id: number;
  organizador_id: number;
  fecha: string;
  hora_apertura: string;
  hora_cierre: string;
  precio_cop: number;
  aforo_maximo: number;
  personas_dentro: number;
  cantidad_vendida: number;
  cantidad_maxima_venta?: number | null;
  estado: EstadoSesionCover;
  evento_id?: number | null;
  tipo_boleta_id?: number | null;
  tipo_cover_nombre?: string;
  fecha_creacion?: string;
  fecha_actualizacion?: string;
}

export interface ConfigCoverLugar {
  lugar: LugarCoverConfig;
  tipos_cover: TipoCover[];
  plantillas_cover: PlantillaCover[];
  sesiones_cover: SesionCover[];
}

export interface AforoSesionCover {
  sesion_cover_id: number;
  lugar_id: number;
  fecha: string;
  estado: EstadoSesionCover;
  aforo_maximo: number;
  personas_dentro: number;
  cupos_disponibles: number;
  cantidad_vendida: number;
  cantidad_maxima_venta?: number | null;
}

/** Ficha pública de un club con covers (RPC obtener_lugar_cover). */
export interface LugarCoverPublico {
  id: number;
  nombre: string;
  direccion?: string;
  ciudad?: string;
  pais?: string;
  capacidad_maxima?: number;
  imagen_principal?: string | null;
  descripcion?: string | null;
  covers_descripcion?: string | null;
  covers_porcentaje_servicio?: number;
  latitud?: number | null;
  longitud?: number | null;
  telefono?: string | null;
  sitio_web?: string | null;
}

export interface TipoCoverPublico {
  id: number;
  nombre: string;
  descripcion?: string | null;
  precio_cop: number;
  permite_reingreso: boolean;
  limite_por_persona?: number | null;
  orden?: number;
  wompi_cuenta_id?: number | null;
}

export interface SesionCoverPublica {
  id: number;
  tipo_cover_id: number;
  tipo_cover_nombre: string;
  fecha: string;
  hora_apertura: string;
  hora_cierre: string;
  precio_cop: number;
  aforo_maximo: number;
  personas_dentro: number;
  cantidad_vendida: number;
  cantidad_maxima_venta?: number | null;
  estado: EstadoSesionCover;
  wompi_cuenta_id?: number | null;
  cupos_dentro_disponibles: number;
  cupos_venta_disponibles?: number | null;
}

export interface CompraCoverCliente {
  id: number;
  cliente_id?: number;
  numero_transaccion: string;
  lugar_id: number;
  lugar_nombre: string;
  total: number;
  estado_pago: string;
  estado_compra: string;
  fecha_compra: string;
  fecha_confirmacion?: string | null;
  boletas_count: number;
}

/** Entrada cover del cliente (consulta boletas_cover + joins). */
export interface BoletaCoverCliente {
  id: number;
  compra_cover_id: number;
  sesion_cover_id: number;
  tipo_cover_id: number;
  codigo_qr: string | null;
  precio_unitario: number;
  estado: string;
  estado_acceso: EstadoAccesoCover;
  titular_cliente_id?: number | null;
  fecha_creacion?: string;
  sesion_fecha: string;
  sesion_hora_apertura: string;
  sesion_hora_cierre: string;
  sesion_estado?: EstadoSesionCover;
  tipo_cover_nombre: string;
  permite_reingreso?: boolean;
  lugar_id: number;
  lugar_nombre: string;
  compra_cliente_id?: number;
  compra_numero_transaccion: string;
  compra_estado_pago: string;
  compra_estado_compra: string;
  compra_fecha_compra: string;
}

export interface ItemPedidoCover {
  tipo_cover_id: number;
  sesion_cover_id: number;
  cantidad: number;
  precio_unitario: number;
}

export interface DetalleLugarCoverPublico {
  lugar: LugarCoverPublico;
  tipos_cover: TipoCoverPublico[];
  sesiones: SesionCoverPublica[];
}

/** Resultado de buscar_boleta_cover_para_escaneo (lector / puerta). */
export interface BoletaCoverEscaneo {
  id: number;
  codigo_qr: string;
  estado_acceso: string;
  entradas_count?: number;
  salidas_count?: number;
  sesion_cover_id: number;
  tipo_cover_id: number;
  lugar_id: number;
  lugar_nombre: string;
  tipo_cover_nombre: string;
  permite_reingreso: boolean;
  sesion_fecha: string;
  hora_apertura: string;
  hora_cierre: string;
  estado_pago?: string;
  estado_compra?: string;
  personas_dentro?: number;
  aforo_maximo?: number;
  titular_nombre?: string;
  titular_documento?: string;
  titular_cliente_id?: number;
}

/** Tarjeta en listado de clubes (RPC listar_lugares_con_covers). */
export interface LugarCoverListado {
  id: number;
  nombre: string;
  direccion?: string;
  ciudad?: string;
  pais?: string;
  imagen_principal?: string | null;
  capacidad_maxima?: number;
  covers_descripcion?: string | null;
  tipos_cover_count?: number;
  cover_hoy_apertura?: string | null;
  precio_desde_cop?: number | null;
}
