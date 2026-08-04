/** Textos unificados del flujo de compra (carrito → pago-wompi → pago-resultado). */
export const COMPRA_COPY = {
  emailHeroLabel: 'Tu compra se ligará a este correo',
  emailHeroLabelConfirmado: 'Tu compra quedó en esta cuenta',
  emailHeroLabelPendiente: 'Cuando se confirme, verás tu compra en esta cuenta',
  wompiReciboNota:
    'En la pasarela puedes usar otro correo solo para el recibo del banco.',
  wompiReciboNotaPostPago:
    'Si el recibo de la pasarela llegó a otro correo, es solo el comprobante del banco.',
  pagoWompiChip: 'Paso 2 · Confirmación antes de la pasarela',
  pagoWompiContinuar: 'Continuar a la pasarela',
  pagoWompiAbriendo: 'Abriendo la pasarela…',
  loginContextoPagar:
    'Entra para finalizar tu compra. Lo que agregaste al carrito se mantiene. Usa el correo donde quieres ver tu compra en Mis compras.',
  sinSesionVinculo: 'Al pagar, todo quedará en el correo de tu cuenta Eventum.',
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

export function lineasDetalleVinculoCarrito(opts: {
  unidadesBoletas: number;
  unidadesProductos: number;
  esMixto: boolean;
  tieneBoletas: boolean;
  tieneProductos: boolean;
}): string[] {
  const lineas: string[] = [];
  if (opts.esMixto) {
    if (opts.unidadesBoletas > 0) {
      lineas.push(`${opts.unidadesBoletas} entrada(s) → Mis compras.`);
    }
    if (opts.unidadesProductos > 0) {
      lineas.push(`${opts.unidadesProductos} producto(s) → QR en Mis compras el día del evento.`);
    }
    return lineas;
  }
  if (opts.tieneBoletas && opts.unidadesBoletas > 0) {
    lineas.push(`${opts.unidadesBoletas} entrada(s) disponibles en Mis compras.`);
  }
  if (opts.tieneProductos && opts.unidadesProductos > 0) {
    lineas.push(`${opts.unidadesProductos} producto(s) — retíralos con QR en Mis compras.`);
  }
  return lineas;
}
