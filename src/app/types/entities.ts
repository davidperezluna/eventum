/* ============================================
   ENTITIES - Interfaces de las entidades de la base de datos
   ============================================ */

import {
  TipoEstadoBoleta,
  TipoEstadoPago,
  TipoEstadoCompra,
  TipoEstadoEvento,
  TipoTipoNotificacion,
  TipoGenero,
  MetodoPago
} from './enums';

/**
 * Usuario del sistema
 */
export interface Usuario {
  id: number;
  tipo_usuario_id: number;
  nombre?: string;
  apellido?: string;
  email: string;
  telefono?: string;
  password_hash?: string;
  fecha_nacimiento?: Date | string;
  genero?: TipoGenero;
  documento_identidad?: string;
  direccion?: string;
  ciudad?: string;
  pais?: string;
  foto_perfil?: string;
  activo?: boolean;
  email_verificado?: boolean;
  fecha_creacion?: Date | string;
  fecha_actualizacion?: Date | string;
  auth_user_id?: string;
}

/**
 * Tipo de usuario
 */
export interface TipoUsuario {
  id: number;
  nombre: string;
  descripcion?: string;
  activo?: boolean;
  fecha_creacion?: Date | string;
}

/**
 * Categoría de evento
 */
export interface CategoriaEvento {
  id: number;
  nombre: string;
  descripcion?: string;
  icono?: string;
  color?: string;
  activo?: boolean;
  fecha_creacion?: Date | string;
}

/**
 * Lugar
 */
export interface Lugar {
  id: number;
  nombre: string;
  direccion: string;
  ciudad: string;
  pais?: string;
  capacidad_maxima?: number;
  latitud?: number;
  longitud?: number;
  telefono?: string;
  email?: string;
  sitio_web?: string;
  descripcion?: string;
  imagen_principal?: string;
  activo?: boolean;
  fecha_creacion?: Date | string;
}

/**
 * Evento
 */
export interface Evento {
  id: number;
  organizador_id: number;
  categoria_id: number;
  lugar_id?: number;
  titulo: string;
  descripcion?: string;
  descripcion_corta?: string;
  imagen_principal?: string;
  fecha_inicio: Date | string;
  fecha_fin: Date | string;
  fecha_venta_inicio: Date | string;
  fecha_venta_fin: Date | string;
  edad_minima?: number;
  es_gratis?: boolean;
  precio_minimo?: number;
  precio_maximo?: number;
  estado?: TipoEstadoEvento;
  destacado?: boolean;
  tags?: string;
  terminos_condiciones?: string;
  politica_reembolso?: string;
  activo?: boolean;
  fecha_creacion?: Date | string;
  fecha_actualizacion?: Date | string;
}

/**
 * Imagen de evento
 */
export interface ImagenEvento {
  id: number;
  evento_id: number;
  url_imagen: string;
  orden?: number;
  descripcion?: string;
  fecha_creacion?: Date | string;
}

/**
 * Tipo de boleta
 */
export interface TipoBoleta {
  id: number;
  evento_id: number;
  nombre: string;
  descripcion?: string;
  precio: number;
  cantidad_total: number;
  cantidad_vendidas?: number;
  cantidad_disponibles: number;
  fecha_venta_inicio?: Date | string;
  fecha_venta_fin?: Date | string;
  limite_por_persona?: number;
  activo?: boolean;
  fecha_creacion?: Date | string;
}

/**
 * Compra
 */
export interface Compra {
  id: number;
  cliente_id: number;
  evento_id: number;
  numero_transaccion: string;
  total: number;
  metodo_pago?: MetodoPago; // Opcional ahora, viene de Wompi
  estado_pago?: TipoEstadoPago;
  estado_compra?: TipoEstadoCompra;
  fecha_compra?: Date | string;
  fecha_confirmacion?: Date | string;
  fecha_cancelacion?: Date | string;
  motivo_cancelacion?: string;
  datos_facturacion?: Record<string, any>;
  notas?: string;
  // Campos de Wompi
  wompi_transaction_id?: string;
  wompi_reference?: string;
  wompi_payment_method?: string;
  wompi_payment_method_type?: string;
  wompi_status?: string;
  wompi_response?: Record<string, any>;
  wompi_webhook_data?: Record<string, any>;
  // Datos enriquecidos (vienen del join)
  cliente?: {
    id: number;
    nombre?: string;
    apellido?: string;
    email: string;
    telefono?: string;
  };
  evento?: {
    id: number;
    titulo: string;
    fecha_inicio: Date | string;
    lugar_id?: number;
    lugar?: {
      id: number;
      nombre: string;
      direccion: string;
      ciudad: string;
      pais?: string;
      telefono?: string;
      email?: string;
    };
  };
}

/**
 * Boleta comprada
 */
export interface BoletaComprada {
  id: number;
  compra_id: number;
  tipo_boleta_id: number;
  codigo_qr: string;
  codigo_barras?: string;
  precio_unitario: number;
  nombre_asistente?: string;
  documento_asistente?: string;
  email_asistente?: string;
  telefono_asistente?: string;
  estado?: TipoEstadoBoleta;
  fecha_uso?: Date | string;
  fecha_creacion?: Date | string;
}

/**
 * Favorito
 */
export interface Favorito {
  id: number;
  cliente_id: number;
  evento_id: number;
  fecha_agregado?: Date | string;
}

/**
 * Calificación
 */
export interface Calificacion {
  id: number;
  cliente_id: number;
  evento_id: number;
  compra_id?: number;
  calificacion: number; // 1-5
  comentario?: string;
  fecha_calificacion?: Date | string;
  fecha_actualizacion?: Date | string;
  activo?: boolean;
}

/**
 * Notificación
 */
export interface Notificacion {
  id: number;
  usuario_id: number;
  titulo: string;
  mensaje: string;
  tipo?: TipoTipoNotificacion;
  leida?: boolean;
  fecha_creacion?: Date | string;
  fecha_lectura?: Date | string;
}

/**
 * Sesión
 */
export interface Sesion {
  id: number;
  usuario_id: number;
  token?: string;
  ip_address?: string;
  user_agent?: string;
  fecha_inicio?: Date | string;
  fecha_fin?: Date | string;
  activa?: boolean;
}

