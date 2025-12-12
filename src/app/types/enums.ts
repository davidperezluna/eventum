/* ============================================
   ENUMS - Tipos enumerados de la base de datos
   ============================================ */

/**
 * Estado de una boleta
 */
export enum TipoEstadoBoleta {
  PENDIENTE = 'pendiente',
  USADA = 'usada',
  CANCELADA = 'cancelada',
  REEMBOLSADA = 'reembolsada'
}

/**
 * Estado de un pago
 */
export enum TipoEstadoPago {
  PENDIENTE = 'pendiente',
  COMPLETADO = 'completado',
  FALLIDO = 'fallido',
  REEMBOLSADO = 'reembolsado',
  CANCELADO = 'cancelado'
}

/**
 * Estado de una compra
 */
export enum TipoEstadoCompra {
  PENDIENTE = 'pendiente',
  CONFIRMADA = 'confirmada',
  CANCELADA = 'cancelada',
  REEMBOLSADA = 'reembolsada'
}

/**
 * Estado de un evento
 */
export enum TipoEstadoEvento {
  BORRADOR = 'borrador',
  PUBLICADO = 'publicado',
  EN_CURSO = 'en_curso',
  FINALIZADO = 'finalizado',
  CANCELADO = 'cancelado'
}

/**
 * Tipo de notificación
 */
export enum TipoTipoNotificacion {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
  COMPRA = 'compra',
  EVENTO = 'evento'
}

/**
 * Género
 */
export enum TipoGenero {
  MASCULINO = 'M',
  FEMENINO = 'F',
  OTRO = 'O',
  NO_ESPECIFICADO = 'N'
}

/**
 * Método de pago
 */
export enum MetodoPago {
  TARJETA_CREDITO = 'tarjeta_credito',
  TARJETA_DEBITO = 'tarjeta_debito',
  TRANSFERENCIA = 'transferencia',
  EFECTIVO = 'efectivo',
  PSE = 'pse',
  NEQUI = 'nequi',
  DAVIPLATA = 'daviplata',
  OTRO = 'otro'
}

