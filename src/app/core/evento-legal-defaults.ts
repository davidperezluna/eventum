export const EVENTO_TERMINOS_CONDICIONES_DEFAULT = `Al comprar entradas a través de Eventum aceptas estos términos.

• Las entradas son personales e intransferibles, salvo autorización expresa del organizador.
• El acceso al evento está sujeto a las normas de seguridad y conducta del lugar y del organizador.
• Eventum actúa como plataforma de venta; la producción y realización del evento es responsabilidad del organizador.
• El organizador puede modificar horarios, artistas o programación por causas de fuerza mayor, informando a los asistentes cuando aplique.
• Está prohibida la reventa no autorizada de entradas.`;

export const EVENTO_POLITICA_REEMBOLSO_DEFAULT = `Política general de reembolsos para ventas online en Eventum:

• Las solicitudes de reembolso deben realizarse antes del inicio del evento, salvo disposición distinta del organizador.
• No hay reembolso por inasistencia, llegada tardía o expulsión por incumplimiento de normas.
• Si el evento se cancela o reprograma, el organizador definirá la política aplicable (reembolso, cambio de fecha o crédito).
• Los cargos por servicio de la plataforma pueden no ser reembolsables según la normativa vigente.
• Para gestionar un reembolso, contacta al organizador del evento con tu comprobante de compra.`;

export function getEventoLegalDefaults(): {
  terminos_condiciones: string;
  politica_reembolso: string;
} {
  return {
    terminos_condiciones: EVENTO_TERMINOS_CONDICIONES_DEFAULT,
    politica_reembolso: EVENTO_POLITICA_REEMBOLSO_DEFAULT,
  };
}
