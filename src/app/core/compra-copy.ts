/** Textos unificados del flujo de compra (carrito → pago-wompi → pago-resultado). */
export const COMPRA_COPY = {
  emailHeroLabel: 'Tu compra quedará en esta cuenta',
  emailHeroLabelConfirmado: 'Tu compra quedó en esta cuenta',
  emailHeroLabelPendiente: 'Cuando se confirme, verás tu compra en esta cuenta',
  identificacionCuentaLabel: 'Identificación',
  compraAppNota:
    'Tu compra no llega a tu correo. Después del pago, consúmala en Mis compras dentro de la app.',
  wompiReciboNota:
    'En la pasarela puedes usar otro correo solo para el recibo del banco.',
  wompiReciboNotaPostPago:
    'Si el recibo de la pasarela llegó a otro correo, es solo el comprobante del banco.',
  wompiReciboNotaPostPagoBoletas:
    'Si el recibo de la pasarela llegó a otro correo, es solo el comprobante del banco. Tus entradas no se envían por correo: consúltalas en Mis compras dentro de la app.',
  pagoWompiContinuar: 'Continuar a la pasarela',
  pagoWompiContinuarRecuperacion: 'Continuar al pago pendiente',
  pagoWompiGenerarNuevoLink: 'Generar nuevo link de pago',
  pagoWompiCancelarPago: 'Cancelar pago',
  pagoWompiLinkExpiradoHint: 'El link de pago venció. Al continuar generamos uno nuevo.',
  pagoWompiAbriendo: 'Abriendo la pasarela…',
  loginContextoPagar:
    'Entra para finalizar tu compra. Lo que agregaste al carrito se mantiene. Usa el correo donde quieres ver tu compra en Mis compras.',
  sinSesionVinculo:
    'Al pagar, tu compra quedará en la cuenta con la que entres. Las entradas solo están en Mis compras, no en tu correo.',
  cuponMixtoTitulo: 'Cupón no disponible en compra mixta',
  cuponMixtoTexto:
    'Boletas y productos se pagan en un solo pedido. Si quieres usar un descuento, compra cada tipo por separado.',
  pagoWompiLead: 'Confirma que sea el correo donde quieres ver tu compra.',
  pagoResultadoLeadCompletado: 'Tu pago se procesó correctamente.',
  pagoResultadoLeadPendiente: 'Estamos confirmando el pago con tu banco o Wompi.',
  pagoResultadoLeadCompletadoSinEmail:
    'Tu compra quedó registrada. Revisa Mis compras para boletas; los productos se entregan en el evento.',
  pagoResultadoLeadPendienteSinEmail:
    'Tu banco o Wompi aún pueden estar procesando el cobro. En unos minutos debería actualizarse aquí y en Mis compras.',
} as const;
