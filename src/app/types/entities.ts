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
  MetodoPago,
  EstadoPalco,
  EstadoTrasladoBoleta,
  TipoEstadoItemProducto,
  TipoEstadoTransaccionProducto
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
  /** Módulo Covers: ficha pública del club. */
  covers_habilitado?: boolean;
  covers_descripcion?: string | null;
  /** % servicio Eventum en venta online de covers (como eventos.porcentaje_servicio). */
  covers_porcentaje_servicio?: number;
  fecha_creacion?: Date | string;
}

/**
 * Evento
 */
export interface Evento {
  id: number;
  organizador_id: number;
  wompi_cuenta_id?: number | null;
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
  /** Porcentaje adicional de servicio cobrado sobre el valor de boletas/palcos. */
  porcentaje_servicio?: number;
  estado?: TipoEstadoEvento;
  destacado?: boolean;
  tags?: string;
  terminos_condiciones?: string;
  politica_reembolso?: string;
  url_video?: string;
  activo?: boolean;
  fecha_creacion?: Date | string;
  fecha_actualizacion?: Date | string;
  lugar?: Lugar;
}

/**
 * Cuenta Wompi (referencia por evento)
 */
export interface WompiCuenta {
  id: number;
  nombre: string;
  private_key_env: string;
  public_key_env?: string | null;
  events_secret_env?: string | null;
  integrity_key_env?: string | null;
  environment_env?: string | null;
  activo: boolean;
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
  /** Personas incluidas por cada palco/unidad vendida (1 = entrada individual). */
  personas_por_unidad?: number;
  /** Tipo palco / paquete grupal (configuración administrativa). */
  es_palco?: boolean;
  /** Imagen del plano con numeración de palcos (URL pública). */
  imagen_mapa_palcos?: string;
  activo?: boolean;
  fecha_creacion?: Date | string;
}

/**
 * Unidad de palco numerada (inventario seleccionable) asociada a un tipo de boleta.
 */
export interface Palco {
  id: number;
  tipo_boleta_id: number;
  numero: number;
  estado: EstadoPalco | string;
  compra_id?: number | null;
  fecha_creacion?: Date | string;
  fecha_actualizacion?: Date | string;
  /** Metadatos del tipo (join Supabase); puede existir aunque el tipo esté inactivo. */
  tipos_boleta?:
    | { nombre?: string; activo?: boolean; es_palco?: boolean }
    | Array<{ nombre?: string; activo?: boolean; es_palco?: boolean }>
    | null;
}

/**
 * Compra
 */
export interface Compra {
  id: number;
  cliente_id: number;
  evento_id: number;
  wompi_cuenta_id?: number | null;
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
  cupon_id?: number;
  descuento_total?: number;
  subtotal?: number;
  porcentaje_servicio?: number;
  valor_servicio?: number;
  valor_servicio_manual?: number;
  // Datos enriquecidos (vienen del join)
  cupon?: {
    id: number;
    codigo: string;
    porcentaje_descuento: number;
  };
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
    imagen_principal?: string;
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
  /** Resumen embebido desde ventas (lista admin). */
  boletas_compradas?: Array<{
    id: number;
    grupo_palco_id?: string | null;
    palco_id?: number | null;
    tipo_boleta_id?: number;
    palcos?: { numero?: number } | { numero?: number }[] | null;
    tipos_boleta?: { nombre?: string } | { nombre?: string }[] | null;
  }>;
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
  /** Agrupa las boletas de un mismo palco vendido. */
  grupo_palco_id?: string | null;
  /** Solo filas en true descuentan inventario del tipo (palco: una por unidad). */
  consume_inventario?: boolean;
  /** Palco físico asignado (tabla palcos). */
  palco_id?: number | null;
  /** Titular actual de la entrada (tras traslado = nuevo usuario). */
  titular_cliente_id?: number | null;
  /** Número legible del palco (si viene del join). */
  numero_palco?: number;
  /** Quién validó la entrada (join desde usuarios). */
  validado_por_usuario_id?: number | null;
  validado_por?: { id: number; nombre?: string; apellido?: string; email?: string } | null;
  estado?: TipoEstadoBoleta;
  fecha_uso?: Date | string;
  fecha_creacion?: Date | string;
  // Información de la compra (viene del join)
  compra?: {
    id: number;
    cliente_id?: number;
    numero_transaccion?: string;
    estado_pago?: TipoEstadoPago;
    estado_compra?: TipoEstadoCompra;
  };
  // Campo directo para facilitar acceso (se puede poblar desde compra)
  estado_pago?: TipoEstadoPago;
  // Información del evento (viene del join)
  evento?: {
    id: number;
    titulo: string;
    fecha_inicio?: Date | string;
    lugar_id?: number;
    imagen_principal?: string;
  };
  /** Metadatos del tipo de boleta (join); se conservan al normalizar la fila. */
  tipo_boleta_meta?: {
    nombre?: string;
    personas_por_unidad?: number;
    es_palco?: boolean;
  };
}

/** Registro de traslado de entrada evento o cover (trazabilidad). */
export interface TrasladoBoleta {
  id: number;
  boleta_id?: number | null;
  boleta_cover_id?: number | null;
  usuario_origen_id: number;
  usuario_destino_id: number;
  email_destino: string;
  estado: EstadoTrasladoBoleta | string;
  fecha_creacion?: string;
  fecha_recibido?: string | null;
  fecha_aceptacion?: string | null;
  fecha_rechazo?: string | null;
  fecha_cancelacion?: string | null;
  /** Contexto del RPC listar_traslados_boleta_* (filtro en detalle evento/club). */
  evento_id?: number | null;
  lugar_id?: number | null;
  /** Join opcional desde API */
  usuario_origen?: Pick<Usuario, 'id' | 'nombre' | 'apellido' | 'email'>;
  usuario_destino?: Pick<Usuario, 'id' | 'nombre' | 'apellido' | 'email'>;
  boleta?: (Pick<BoletaComprada, 'id' | 'codigo_qr' | 'tipo_boleta_id' | 'numero_palco'> & {
    tipos_boleta?: {
      nombre?: string;
      eventos?: {
        titulo?: string;
      } | Array<{
        titulo?: string;
      }>;
    } | Array<{
      nombre?: string;
      eventos?: {
        titulo?: string;
      } | Array<{
        titulo?: string;
      }>;
    }>;
  });
  coverDetail?: { id: number; tipo_cover_nombre?: string; lugar_nombre?: string };
  boleta_cover?: {
    id: number;
    codigo_qr?: string | null;
    tipo_cover_id?: number;
    tipos_cover?: { nombre?: string } | Array<{ nombre?: string }>;
    sesiones_cover?: {
      fecha?: string;
      lugares?: { nombre?: string } | Array<{ nombre?: string }>;
    } | Array<{
      fecha?: string;
      lugares?: { nombre?: string } | Array<{ nombre?: string }>;
    }>;
  };
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

/**
 * Cupón de descuento
 */
export interface CuponDescuento {
  id: number;
  evento_id: number;
  codigo: string;
  porcentaje_descuento: number;
  max_usos: number;
  usos_actuales: number;
  activo: boolean;
  fecha_expiracion?: Date | string;
  fecha_creacion?: Date | string;
}

/**
 * Permiso de escaneo: usuario con rol Lector + evento + tipo de boleta (el tipo debe ser del evento).
 */
export interface LectorEventoTipoBoleta {
  id: number;
  usuario_id: number;
  evento_id: number;
  /** null => permiso de productos para el evento */
  tipo_boleta_id: number | null;
  fecha_creacion?: Date | string;
  usuarios?: Pick<Usuario, 'id' | 'nombre' | 'apellido' | 'email'>;
  eventos?: Pick<Evento, 'id' | 'titulo'>;
  tipos_boleta?: Pick<TipoBoleta, 'id' | 'nombre' | 'evento_id'>;
}

/** Permiso de escaneo cover: lector + lugar + tipo_cover (sin evento). */
export interface LectorLugarTipoCover {
  id: number;
  usuario_id: number;
  lugar_id: number;
  tipo_cover_id: number;
  fecha_creacion?: Date | string;
  usuarios?: Pick<Usuario, 'id' | 'nombre' | 'apellido' | 'email'>;
  lugares?: Pick<Lugar, 'id' | 'nombre' | 'ciudad'>;
  tipos_cover?: { id: number; nombre: string; lugar_id: number };
}

/** Producto del catálogo de un evento (venta separada de boletas). */
export interface Producto {
  id: number;
  evento_id: number;
  nombre: string;
  descripcion?: string;
  /** Precio preventa (antes de iniciar el evento). */
  precio: number;
  /** Precio aplicable durante el evento; si no existe, usa `precio`. */
  precio_evento?: number;
  /** Solo frontend: referencia del precio preventa al guardar en carrito. */
  precio_preventa?: number;
  imagen_url?: string;
  es_licor?: boolean;
  cantidad_total: number;
  cantidad_vendidas?: number;
  cantidad_disponibles?: number;
  limite_por_persona?: number;
  fecha_venta_inicio?: Date | string;
  fecha_venta_fin?: Date | string;
  activo?: boolean;
  orden?: number;
  fecha_creacion?: Date | string;
  fecha_actualizacion?: Date | string;
  eventos?: Pick<Evento, 'id' | 'titulo'>;
}

/** Cabecera de compra de productos. */
export interface CompraProducto {
  id: number;
  cliente_id: number;
  evento_id: number;
  wompi_cuenta_id?: number;
  numero_pedido: string;
  subtotal: number;
  porcentaje_servicio: number;
  valor_servicio: number;
  descuento_total: number;
  total: number;
  estado_pago: TipoEstadoPago;
  estado_compra: TipoEstadoCompra;
  terminos_licor_aceptados?: boolean;
  terminos_licor_aceptados_at?: Date | string;
  datos_facturacion?: Record<string, unknown>;
  fecha_compra?: Date | string;
  fecha_confirmacion?: Date | string;
  fecha_cancelacion?: Date | string;
  motivo_cancelacion?: string;
  eventos?: Pick<Evento, 'id' | 'titulo' | 'imagen_principal' | 'fecha_inicio' | 'fecha_fin' | 'lugar'>;
  compras_productos_items?: CompraProductoItem[];
}

/** Línea de compra de productos. */
export interface CompraProductoItem {
  id: number;
  compra_producto_id: number;
  producto_id: number;
  codigo_qr?: string;
  cantidad: number;
  precio_unitario: number;
  subtotal_linea?: number;
  estado?: TipoEstadoItemProducto | string;
  fecha_redencion?: Date | string;
  validado_por_usuario_id?: number;
  fecha_creacion?: Date | string;
  productos?: Pick<Producto, 'id' | 'nombre' | 'imagen_url' | 'es_licor' | 'precio' | 'precio_evento'>;
}

/** Transacción Wompi para compra de productos. */
export interface TransaccionProducto {
  id: number;
  compra_producto_id?: number | null;
  evento_id?: number;
  cliente_id?: number;
  wompi_cuenta_id?: number;
  numero_transaccion: string;
  wompi_transaction_id?: string;
  wompi_reference?: string;
  wompi_status?: string;
  monto: number;
  monto_centavos: number;
  moneda?: string;
  estado: TipoEstadoTransaccionProducto | string;
  checkout_url?: string;
  redirect_url?: string;
  request_payload?: Record<string, unknown>;
  response_payload?: Record<string, unknown>;
  webhook_payload?: Record<string, unknown>;
  es_activa?: boolean;
  fecha_creacion?: Date | string;
  fecha_actualizacion?: Date | string;
  fecha_confirmacion?: Date | string;
}
