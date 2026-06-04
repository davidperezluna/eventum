import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, signature',
}

const ENV_VAR_NAME_REGEX = /^[A-Z][A-Z0-9_]*$/

function resolveSecretByEnvName(envVarName: string | null | undefined): string | null {
  const name = String(envVarName || '').trim()
  if (!name) return null
  if (!ENV_VAR_NAME_REGEX.test(name)) {
    throw new Error(`Nombre de variable inválido: "${name}"`)
  }
  const value = Deno.env.get(name)
  return value && value.trim().length > 0 ? value.trim() : null
}

type TipoPago = 'boletas' | 'productos' | 'mixto'
type CheckoutIntent = {
  id: number
  evento_id?: number | null
  cliente_id?: number | null
  wompi_cuenta_id?: number | null
  compra_id?: number | null
  compra_producto_id?: number | null
  request_payload?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}

function parseReference(reference: string | null | undefined): {
  transaccionProductoId: number | null
  transaccionCheckoutId: number | null
} {
  const ref = String(reference || '').trim()
  if (!ref) {
    return { transaccionProductoId: null, transaccionCheckoutId: null }
  }

  const checkoutMatch = ref.match(/^EVENTUM-CHK-TXN-(\d+)-/i)
  if (checkoutMatch) {
    return {
      transaccionProductoId: null,
      transaccionCheckoutId: Number(checkoutMatch[1]),
    }
  }

  const mixMatch = ref.match(/^EVENTUM-MIX-(\d+)-TXN-(\d+)-/i)
  if (mixMatch) {
    return {
      transaccionProductoId: Number(mixMatch[2]),
      transaccionCheckoutId: null,
    }
  }

  const prodTxnMatch = ref.match(/^EVENTUM-PROD-TXN-(\d+)-/i)
  if (prodTxnMatch) {
    return {
      transaccionProductoId: Number(prodTxnMatch[1]),
      transaccionCheckoutId: null,
    }
  }

  return { transaccionProductoId: null, transaccionCheckoutId: null }
}

function mapEstadosWompi(wompiStatus: string | undefined): {
  estadoPago: string
  estadoCompra: string
  estadoTransaccionProducto: string
} {
  switch (wompiStatus) {
    case 'APPROVED':
      return {
        estadoPago: 'completado',
        estadoCompra: 'confirmada',
        estadoTransaccionProducto: 'aprobada',
      }
    case 'DECLINED':
    case 'VOIDED':
    case 'ERROR':
      return {
        estadoPago: 'fallido',
        estadoCompra: 'cancelada',
        estadoTransaccionProducto: 'rechazada',
      }
    case 'PENDING':
    default:
      return {
        estadoPago: 'pendiente',
        estadoCompra: 'pendiente',
        estadoTransaccionProducto: 'pendiente',
      }
  }
}

function mapEstadoCheckout(wompiStatus: string | undefined): string {
  const normalized = String(wompiStatus || '').toUpperCase()
  if (normalized === 'APPROVED') return 'aprobada'
  if (normalized === 'DECLINED' || normalized === 'VOIDED') return 'rechazada'
  if (normalized === 'ERROR') return 'error'
  return 'pendiente'
}

function isFailedWompiStatus(status: unknown): boolean {
  const normalized = String(status || '').toUpperCase()
  return normalized === 'DECLINED' || normalized === 'VOIDED' || normalized === 'ERROR'
}

function isMissingRpcError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null
  const msg = String(e?.message || '').toLowerCase()
  return (
    e?.code === '42883' ||
    e?.code === 'PGRST202' ||
    msg.includes('function') && msg.includes('does not exist')
  )
}

async function liberarPalcosCheckoutPendiente(
  supabaseClient: ReturnType<typeof createClient>,
  checkoutId: number,
): Promise<void> {
  const { error } = await supabaseClient.rpc('cancelar_reserva_palcos_checkout', {
    p_transaccion_checkout_id: checkoutId,
  })
  if (error && !isMissingRpcError(error)) {
    throw error
  }
}

function mapMetodoPago(transaction: Record<string, unknown>): string | null {
  const paymentMethodType = transaction.payment_method_type
    ? String(transaction.payment_method_type).trim().toUpperCase()
    : null

  if (!paymentMethodType) return null

  const metodoPagoMap: Record<string, string> = {
    CARD: 'tarjeta_credito',
    PSE: 'pse',
    NEQUI: 'nequi',
    BANCOLOMBIA_TRANSFER: 'transferencia',
    BANCOLOMBIA_COLLECT: 'efectivo',
    CASH: 'efectivo',
    DAVIPLATA: 'daviplata',
    PCOL: 'puntos_colombia',
    BNPL: 'bnpl_bancolombia',
    SU_PLUS: 'su_plus',
  }

  if (paymentMethodType === 'CARD') {
    const extra = transaction.payment_method as { extra?: { card_type?: string } } | undefined
    const cardType = extra?.extra?.card_type
    if (cardType === 'DEBIT' || String(cardType).toUpperCase() === 'DEBIT') {
      return 'tarjeta_debito'
    }
    return 'tarjeta_credito'
  }

  return metodoPagoMap[paymentMethodType] || 'otro'
}

async function actualizarCompraBoletas(  supabaseClient: ReturnType<typeof createClient>,
  compraId: number,
  transaction: Record<string, unknown>,
  webhookData: Record<string, unknown>,
  wompiCuentaId: number | null,
) {
  const estados = mapEstadosWompi(String(transaction.status || ''))
  const updateData: Record<string, unknown> = {
    wompi_status: transaction.status,
    wompi_webhook_data: webhookData,
    wompi_cuenta_id: wompiCuentaId,
    estado_pago: estados.estadoPago,
    estado_compra: estados.estadoCompra,
  }

  const metodoPago = mapMetodoPago(transaction)
  if (transaction.payment_method_type) {
    updateData.wompi_payment_method_type = transaction.payment_method_type
  }
  if (metodoPago) {
    updateData.metodo_pago = metodoPago
  }
  if (transaction) {
    updateData.wompi_response = transaction
  }

  if (transaction.status === 'APPROVED') {
    updateData.fecha_confirmacion = new Date().toISOString()
    updateData.fecha_cancelacion = null
    updateData.motivo_cancelacion = null
  } else if (isFailedWompiStatus(transaction.status)) {
    updateData.fecha_cancelacion = new Date().toISOString()
    updateData.motivo_cancelacion =
      (transaction.status_text as string) ||
      ((transaction.error as { message?: string } | undefined)?.message) ||
      'Pago rechazado por Wompi'
  }

  const { error } = await supabaseClient
    .from('compras')
    .update(updateData)
    .eq('id', compraId)

  if (error) {
    throw error
  }

  if (isFailedWompiStatus(transaction.status)) {
    const { error: liberarPalcosError } = await supabaseClient.rpc('cancelar_reserva_palcos_compra', {
      p_compra_id: compraId,
    })
    if (liberarPalcosError) {
      throw liberarPalcosError
    }
  }
}

async function crearCompraProductoDesdePedido(
  supabaseClient: ReturnType<typeof createClient>,
  transaccionProductoId: number,
  wompiCuentaId: number | null,
): Promise<number> {
  const { data: transaccion, error: txnError } = await supabaseClient
    .from('transacciones_producto')
    .select('id, compra_producto_id, request_payload')
    .eq('id', transaccionProductoId)
    .single()

  if (txnError || !transaccion) {
    throw txnError || new Error(`Transacción producto ${transaccionProductoId} no encontrada`)
  }

  if (transaccion.compra_producto_id) {
    return Number(transaccion.compra_producto_id)
  }

  const payload = transaccion.request_payload as { pedido?: Record<string, unknown> } | null
  const pedido = payload?.pedido
  if (!pedido || !Array.isArray(pedido.items) || pedido.items.length === 0) {
    throw new Error('La transacción no tiene pedido de productos pendiente')
  }

  const numeroPedido = `PROD-${Date.now()}-${Math.floor(Math.random() * 10000)}`
  const { data: compra, error: compraError } = await supabaseClient
    .from('compras_productos')
    .insert({
      cliente_id: Number(pedido.cliente_id),
      evento_id: Number(pedido.evento_id),
      wompi_cuenta_id: wompiCuentaId,
      numero_pedido: numeroPedido,
      subtotal: Number(pedido.subtotal ?? 0),
      descuento_total: 0,
      porcentaje_servicio: Number(pedido.porcentaje_servicio ?? 0),
      valor_servicio: Number(pedido.valor_servicio ?? 0),
      total: Number(pedido.total ?? 0),
      estado_pago: 'pendiente',
      estado_compra: 'pendiente',
      terminos_licor_aceptados: !!pedido.terminos_licor_aceptados,
      terminos_licor_aceptados_at: pedido.terminos_licor_aceptados ? new Date().toISOString() : null,
      fecha_compra: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (compraError || !compra) {
    throw compraError || new Error('No se pudo crear compras_productos')
  }

  const compraProductoId = Number(compra.id)
  const rows = (pedido.items as Array<Record<string, unknown>>).map((item) => ({
    compra_producto_id: compraProductoId,
    producto_id: Number(item.producto_id),
    cantidad: Number(item.cantidad),
    precio_unitario: Number(item.precio_unitario),
    estado: 'pendiente',
  }))

  const { error: itemsError } = await supabaseClient.from('compras_productos_items').insert(rows)
  if (itemsError) {
    await supabaseClient.from('compras_productos').delete().eq('id', compraProductoId)
    throw itemsError
  }

  await supabaseClient
    .from('transacciones_producto')
    .update({ compra_producto_id: compraProductoId, fecha_actualizacion: new Date().toISOString() })
    .eq('id', transaccionProductoId)

  return compraProductoId
}

function getPedidoProductosFromCheckout(checkout: CheckoutIntent): Record<string, unknown> | null {
  const payload = (checkout.request_payload || {}) as Record<string, unknown>
  const requestBody = (payload.request_body || {}) as Record<string, unknown>
  const nested = requestBody.pedido_productos
  if (nested && typeof nested === 'object') return nested as Record<string, unknown>
  const direct = payload.pedido_productos
  if (direct && typeof direct === 'object') return direct as Record<string, unknown>
  return null
}

async function crearCompraProductoDesdeCheckout(
  supabaseClient: ReturnType<typeof createClient>,
  checkout: CheckoutIntent,
  wompiCuentaId: number | null,
): Promise<number> {
  if (checkout.compra_producto_id) {
    return Number(checkout.compra_producto_id)
  }

  const pedido = getPedidoProductosFromCheckout(checkout)
  if (!pedido || !Array.isArray(pedido.items) || pedido.items.length === 0) {
    throw new Error('El checkout no contiene pedido_productos para materializar compra')
  }

  const numeroPedido = `PROD-${Date.now()}-${Math.floor(Math.random() * 10000)}`
  const { data: compra, error: compraError } = await supabaseClient
    .from('compras_productos')
    .insert({
      cliente_id: Number(pedido.cliente_id),
      evento_id: Number(pedido.evento_id),
      wompi_cuenta_id: wompiCuentaId,
      numero_pedido: numeroPedido,
      subtotal: Number(pedido.subtotal ?? 0),
      descuento_total: 0,
      porcentaje_servicio: Number(pedido.porcentaje_servicio ?? 0),
      valor_servicio: Number(pedido.valor_servicio ?? 0),
      total: Number(pedido.total ?? 0),
      estado_pago: 'pendiente',
      estado_compra: 'pendiente',
      terminos_licor_aceptados: !!pedido.terminos_licor_aceptados,
      terminos_licor_aceptados_at: pedido.terminos_licor_aceptados ? new Date().toISOString() : null,
      fecha_compra: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (compraError || !compra) {
    throw compraError || new Error('No se pudo crear compras_productos desde checkout')
  }

  const compraProductoId = Number(compra.id)
  const rows = (pedido.items as Array<Record<string, unknown>>).map((item) => ({
    compra_producto_id: compraProductoId,
    producto_id: Number(item.producto_id),
    cantidad: Number(item.cantidad),
    precio_unitario: Number(item.precio_unitario),
    estado: 'pendiente',
  }))

  const { error: itemsError } = await supabaseClient.from('compras_productos_items').insert(rows)
  if (itemsError) {
    await supabaseClient.from('compras_productos').delete().eq('id', compraProductoId)
    throw itemsError
  }

  return compraProductoId
}

async function actualizarCompraProductoDesdeCheckout(
  supabaseClient: ReturnType<typeof createClient>,
  compraProductoId: number,
  transaction: Record<string, unknown>,
  wompiCuentaId: number | null,
): Promise<void> {
  const estados = mapEstadosWompi(String(transaction.status || ''))
  const now = new Date().toISOString()

  if (String(transaction.status || '').toUpperCase() === 'APPROVED') {
    const { error: rpcError } = await supabaseClient.rpc('confirmar_compra_producto', {
      p_compra_producto_id: compraProductoId,
    })
    if (rpcError) {
      console.warn('RPC confirmar_compra_producto falló (checkout-only), aplicando update manual:', rpcError.message)
      const { error: compraError } = await supabaseClient
        .from('compras_productos')
        .update({
          estado_pago: estados.estadoPago,
          estado_compra: estados.estadoCompra,
          fecha_confirmacion: now,
          fecha_cancelacion: null,
          motivo_cancelacion: null,
          wompi_cuenta_id: wompiCuentaId,
        })
        .eq('id', compraProductoId)
      if (compraError) {
        throw compraError
      }
    }
    return
  }

  if (isFailedWompiStatus(transaction.status)) {
    const { error: compraError } = await supabaseClient
      .from('compras_productos')
      .update({
        estado_pago: estados.estadoPago,
        estado_compra: estados.estadoCompra,
        fecha_cancelacion: now,
        motivo_cancelacion:
          (transaction.status_text as string) ||
          ((transaction.error as { message?: string } | undefined)?.message) ||
          'Pago rechazado por Wompi',
        wompi_cuenta_id: wompiCuentaId,
      })
      .eq('id', compraProductoId)
    if (compraError) {
      throw compraError
    }
  }
}

function generarNumeroTransaccionBoletas(): string {
  return `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`
}

function generarCodigoQrBoleta(): string {
  return `B-${crypto.randomUUID()}`
}

function getPedidoBoletasFromCheckout(checkout: CheckoutIntent): Record<string, unknown> | null {
  const payload = (checkout.request_payload || {}) as Record<string, unknown>
  const requestBody = (payload.request_body || {}) as Record<string, unknown>
  const nested = requestBody.pedido_boletas
  if (nested && typeof nested === 'object') return nested as Record<string, unknown>
  const direct = payload.pedido_boletas
  if (direct && typeof direct === 'object') return direct as Record<string, unknown>
  return null
}

function hasPedidoBoletas(checkout: CheckoutIntent): boolean {
  const pedido = getPedidoBoletasFromCheckout(checkout)
  if (!pedido) return false
  return Array.isArray((pedido as Record<string, unknown>).items) &&
    ((pedido as Record<string, unknown>).items as unknown[]).length > 0
}

function hasPedidoProductos(checkout: CheckoutIntent): boolean {
  const pedido = getPedidoProductosFromCheckout(checkout)
  if (!pedido) return false
  return Array.isArray((pedido as Record<string, unknown>).items) &&
    ((pedido as Record<string, unknown>).items as unknown[]).length > 0
}

async function crearCompraBoletasDesdeCheckout(
  supabaseClient: ReturnType<typeof createClient>,
  checkout: CheckoutIntent,
  wompiCuentaId: number | null,
): Promise<number> {
  if (checkout.compra_id) {
    return Number(checkout.compra_id)
  }

  const pedido = getPedidoBoletasFromCheckout(checkout)
  if (!pedido) {
    throw new Error('El checkout no contiene pedido_boletas para materializar compra')
  }

  const items = Array.isArray(pedido.items) ? (pedido.items as Array<Record<string, unknown>>) : []
  if (items.length === 0) {
    throw new Error('pedido_boletas.items está vacío')
  }

  const compraData: Record<string, unknown> = {
    cliente_id: Number(pedido.cliente_id),
    evento_id: Number(pedido.evento_id),
    numero_transaccion: generarNumeroTransaccionBoletas(),
    subtotal: Number(pedido.subtotal ?? 0),
    descuento_total: Number(pedido.descuento_total ?? 0),
    porcentaje_servicio: Number(pedido.porcentaje_servicio ?? 0),
    valor_servicio: Number(pedido.valor_servicio ?? 0),
    total: Number(pedido.total ?? 0),
    cupon_id: pedido.cupon_id ? Number(pedido.cupon_id) : null,
    estado_pago: 'pendiente',
    estado_compra: 'pendiente',
    fecha_compra: new Date().toISOString(),
    wompi_cuenta_id: wompiCuentaId,
    metodo_pago: null,
  }

  const { data: compra, error: compraError } = await supabaseClient
    .from('compras')
    .insert(compraData)
    .select('id')
    .single()

  if (compraError || !compra) {
    throw compraError || new Error('No se pudo crear compra de boletas desde checkout')
  }

  const compraId = Number(compra.id)

  try {
    const tipoIds = [...new Set(items.map((item) => Number(item.tipo_boleta_id)))]
    const { data: tiposMeta, error: tiposMetaError } = await supabaseClient
      .from('tipos_boleta')
      .select('id, personas_por_unidad')
      .in('id', tipoIds)

    if (tiposMetaError || !tiposMeta || tiposMeta.length !== tipoIds.length) {
      throw tiposMetaError || new Error('No se pudo validar los tipos de boleta')
    }

    const cuposPorTipo = new Map<number, number>(
      tiposMeta.map((t: { id: number; personas_por_unidad: number | null }) => [
        Number(t.id),
        Math.max(1, Number(t.personas_por_unidad ?? 1)),
      ]),
    )

    let materializoReservaCheckout = false
    if (checkout.id) {
      const { data: movedRaw, error: materializarError } = await supabaseClient.rpc(
        'materializar_reserva_palcos_checkout',
        {
          p_transaccion_checkout_id: checkout.id,
          p_compra_id: compraId,
        },
      )
      if (materializarError) {
        if (!isMissingRpcError(materializarError)) {
          throw materializarError
        }
      } else {
        const moved = Number(movedRaw ?? 0)
        materializoReservaCheckout = Number.isFinite(moved) && moved > 0
      }
    }

    for (const item of items) {
      const tipoBoletaId = Number(item.tipo_boleta_id)
      const cantidad = Number(item.cantidad)
      const cupos = cuposPorTipo.get(tipoBoletaId) ?? 1
      if (cupos > 1) {
        const palcoIds = Array.isArray(item.palco_ids)
          ? item.palco_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
          : []
        if (palcoIds.length !== cantidad) {
          throw new Error(`Palco (tipo ${tipoBoletaId}): faltan palco_ids para materializar la compra`)
        }
        if (!materializoReservaCheckout) {
          const { error: reservaErr } = await supabaseClient.rpc('reservar_palcos', {
            p_compra_id: compraId,
            p_palco_ids: palcoIds,
          })
          if (reservaErr) {
            throw reservaErr
          }
        }
      }
    }

    const now = new Date().toISOString()
    const boletasRows: Record<string, unknown>[] = []

    for (const item of items) {
      const tipoBoletaId = Number(item.tipo_boleta_id)
      const cantidad = Number(item.cantidad)
      const precioUnitario = Number(item.precio_unitario)
      const cupos = cuposPorTipo.get(tipoBoletaId) ?? 1

      if (cupos > 1) {
        const palcoIds = Array.isArray(item.palco_ids)
          ? item.palco_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
          : []
        for (let u = 0; u < cantidad; u++) {
          const grupoId = crypto.randomUUID()
          const palcoId = palcoIds[u]
          for (let p = 0; p < cupos; p++) {
            boletasRows.push({
              compra_id: compraId,
              tipo_boleta_id: tipoBoletaId,
              codigo_qr: generarCodigoQrBoleta(),
              precio_unitario: p === 0 ? precioUnitario : 0,
              estado: 'pendiente',
              fecha_creacion: now,
              grupo_palco_id: grupoId,
              palco_id: palcoId,
              consume_inventario: p === 0,
            })
          }
        }
      } else {
        for (let i = 0; i < cantidad; i++) {
          boletasRows.push({
            compra_id: compraId,
            tipo_boleta_id: tipoBoletaId,
            codigo_qr: generarCodigoQrBoleta(),
            precio_unitario: precioUnitario,
            estado: 'pendiente',
            fecha_creacion: now,
            consume_inventario: true,
          })
        }
      }
    }

    const { error: boletasError } = await supabaseClient.from('boletas_compradas').insert(boletasRows)
    if (boletasError) {
      throw boletasError
    }

    return compraId
  } catch (e) {
    await supabaseClient.rpc('cancelar_reserva_palcos_compra', { p_compra_id: compraId })
    await supabaseClient.from('compras').delete().eq('id', compraId)
    throw e
  }
}

async function procesarTransaccionProducto(
  supabaseClient: ReturnType<typeof createClient>,
  transaccionProductoId: number,
  transaction: Record<string, unknown>,
  webhookData: Record<string, unknown>,
  wompiCuentaId: number | null,
): Promise<number | null> {
  const estados = mapEstadosWompi(String(transaction.status || ''))
  const now = new Date().toISOString()
  let compraProductoId: number | null = null

  const { data: transaccionActual } = await supabaseClient
    .from('transacciones_producto')
    .select('id, compra_producto_id, request_payload, evento_id')
    .eq('id', transaccionProductoId)
    .maybeSingle()

  if (!transaccionActual) {
    throw new Error(`Transacción producto ${transaccionProductoId} no encontrada`)
  }

  if (transaction.status === 'APPROVED') {
    compraProductoId = transaccionActual.compra_producto_id
      ? Number(transaccionActual.compra_producto_id)
      : await crearCompraProductoDesdePedido(supabaseClient, transaccionProductoId, wompiCuentaId)

    const { error: rpcError } = await supabaseClient.rpc('confirmar_compra_producto', {
      p_compra_producto_id: compraProductoId,
    })
    if (rpcError) {
      console.warn('RPC confirmar_compra_producto falló, aplicando update manual:', rpcError.message)
      await supabaseClient
        .from('compras_productos')
        .update({
          estado_pago: estados.estadoPago,
          estado_compra: estados.estadoCompra,
          fecha_confirmacion: now,
          wompi_cuenta_id: wompiCuentaId,
        })
        .eq('id', compraProductoId)
    }

    // Si la compra fue marcada antes como cancelada/expirada, limpiar esos campos al aprobar.
    await supabaseClient
      .from('compras_productos')
      .update({
        fecha_cancelacion: null,
        motivo_cancelacion: null,
      })
      .eq('id', compraProductoId)
  } else if (transaccionActual.compra_producto_id) {
    compraProductoId = Number(transaccionActual.compra_producto_id)
    const updateCompra: Record<string, unknown> = {
      estado_pago: estados.estadoPago,
      estado_compra: estados.estadoCompra,
      wompi_cuenta_id: wompiCuentaId,
    }
    if (transaction.status === 'DECLINED' || transaction.status === 'VOIDED') {
      updateCompra.fecha_cancelacion = now
      updateCompra.motivo_cancelacion =
        (transaction.status_text as string) ||
        ((transaction.error as { message?: string } | undefined)?.message) ||
        'Pago rechazado por Wompi'
    }
    await supabaseClient.from('compras_productos').update(updateCompra).eq('id', compraProductoId)
  }

  await supabaseClient
    .from('transacciones_producto')
    .update({
      wompi_status: transaction.status,
      webhook_payload: webhookData,
      response_payload: transaction,
      wompi_cuenta_id: wompiCuentaId,
      estado: estados.estadoTransaccionProducto,
      fecha_actualizacion: now,
      fecha_confirmacion: transaction.status === 'APPROVED' ? now : null,
      compra_producto_id: compraProductoId ?? transaccionActual.compra_producto_id,
    })
    .eq('id', transaccionProductoId)

  return compraProductoId
}

async function findTransaccionCheckout(
  supabaseClient: ReturnType<typeof createClient>,
  paymentLinkId: string | undefined,
  reference: string | undefined,
  transaccionCheckoutIdHint: number | null,
): Promise<CheckoutIntent | null> {
  try {
    if (transaccionCheckoutIdHint) {
      const { data } = await supabaseClient
        .from('transacciones_checkout')
        .select('*')
        .eq('id', transaccionCheckoutIdHint)
        .maybeSingle()
      if (data) return data as CheckoutIntent
    }

    if (paymentLinkId) {
      const { data } = await supabaseClient
        .from('transacciones_checkout')
        .select('*')
        .eq('wompi_transaction_id', paymentLinkId)
        .maybeSingle()
      if (data) return data as CheckoutIntent
    }

    if (reference) {
      const { data } = await supabaseClient
        .from('transacciones_checkout')
        .select('*')
        .eq('wompi_reference', reference)
        .order('fecha_creacion', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (data) return data as CheckoutIntent
    }
  } catch (e) {
    console.warn('No se pudo resolver transacciones_checkout:', (e as Error).message)
  }
  return null
}

async function actualizarTransaccionCheckout(
  supabaseClient: ReturnType<typeof createClient>,
  checkout: CheckoutIntent,
  transaction: Record<string, unknown>,
  webhookData: Record<string, unknown>,
  paymentLinkId: string | undefined,
  reference: string | undefined,
  compraBoletasId: number | null,
  compraProductoId: number | null,
  transaccionProductoId: number | null,
) {
  const now = new Date().toISOString()
  const wompiStatus = String(transaction.status || '').toUpperCase()
  const estado = mapEstadoCheckout(wompiStatus)
  const materializado = wompiStatus === 'APPROVED' && (!!compraBoletasId || !!compraProductoId)

  const nextMetadata: Record<string, unknown> = { ...((checkout.metadata || {}) as Record<string, unknown>) }
  if (transaccionProductoId) nextMetadata.transaccion_producto_id = transaccionProductoId

  const updateData: Record<string, unknown> = {
    wompi_status: wompiStatus || transaction.status,
    estado,
    webhook_payload: webhookData,
    response_payload: transaction,
    metadata: nextMetadata,
    materializado,
    materializado_at: materializado ? now : null,
    fecha_confirmacion: wompiStatus === 'APPROVED' ? now : null,
    fecha_cancelacion: wompiStatus === 'DECLINED' || wompiStatus === 'VOIDED' || wompiStatus === 'ERROR' ? now : null,
    motivo_cancelacion:
      wompiStatus === 'DECLINED' || wompiStatus === 'VOIDED' || wompiStatus === 'ERROR'
        ? ((transaction.status_text as string) ||
            ((transaction.error as { message?: string } | undefined)?.message) ||
            'Pago rechazado por Wompi')
        : null,
    es_activa: wompiStatus === 'PENDING' || !wompiStatus,
  }
  if (paymentLinkId) updateData.wompi_transaction_id = paymentLinkId
  if (reference) updateData.wompi_reference = reference
  if (compraBoletasId) updateData.compra_id = compraBoletasId
  if (compraProductoId) updateData.compra_producto_id = compraProductoId

  await supabaseClient
    .from('transacciones_checkout')
    .update(updateData)
    .eq('id', checkout.id)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('=== Webhook recibido de Wompi ===')

    const bodyText = await req.text()
    let webhookData: Record<string, unknown>
    try {
      webhookData = JSON.parse(bodyText)
    } catch (e) {
      throw new Error('Invalid JSON in webhook body')
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    if (!webhookData.event || !webhookData.data) {
      throw new Error('Datos de webhook inválidos')
    }

    const data = webhookData.data as Record<string, unknown>
    const transaction = (data.transaction || data) as Record<string, unknown>
    const paymentLinkId = (transaction.payment_link_id ||
      (transaction.payment_link as { id?: string } | undefined)?.id) as string | undefined
    const reference = transaction.reference as string | undefined
    const parsedRef = parseReference(reference)

    console.log('Webhook resumen:', {
      event: webhookData.event,
      paymentLinkId,
      reference,
      parsedRef,
      status: transaction.status,
    })

    if (!paymentLinkId && !reference) {
      return new Response(
        JSON.stringify({ received: true, message: 'Sin payment_link_id ni reference' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      )
    }

    let transaccionProducto: Record<string, unknown> | null = null
    let transaccionCheckout = await findTransaccionCheckout(
      supabaseClient,
      paymentLinkId,
      reference,
      parsedRef.transaccionCheckoutId,
    )

    if (paymentLinkId) {
      const { data: transaccionData } = await supabaseClient
        .from('transacciones_producto')
        .select('id, compra_producto_id, wompi_cuenta_id, wompi_reference, wompi_transaction_id, estado')
        .eq('wompi_transaction_id', paymentLinkId)
        .eq('es_activa', true)
        .maybeSingle()
      transaccionProducto = transaccionData
    }

    let transaccionProductoId = transaccionProducto?.id
      ? Number(transaccionProducto.id)
      : parsedRef.transaccionProductoId

    if (!transaccionProductoId && transaccionCheckout) {
      const fromMeta = Number(
        (transaccionCheckout.metadata as Record<string, unknown> | null)?.transaccion_producto_id ?? 0,
      )
      if (Number.isFinite(fromMeta) && fromMeta > 0) {
        transaccionProductoId = fromMeta
      }
    }

    if (!transaccionProducto && transaccionProductoId) {
      const { data } = await supabaseClient
        .from('transacciones_producto')
        .select('id, compra_producto_id, wompi_cuenta_id, wompi_reference, wompi_transaction_id, estado, evento_id')
        .eq('id', transaccionProductoId)
        .maybeSingle()
      transaccionProducto = data
    }

    let compraProductoId = transaccionProducto?.compra_producto_id
      ? Number(transaccionProducto.compra_producto_id)
      : null
    if (!compraProductoId && transaccionCheckout?.compra_producto_id) {
      compraProductoId = Number(transaccionCheckout.compra_producto_id)
    }

    let compraBoletas: Record<string, unknown> | null = null
    const compraBoletasId = transaccionCheckout?.compra_id ? Number(transaccionCheckout.compra_id) : null

    if (compraBoletasId) {
      const { data } = await supabaseClient
        .from('compras')
        .select('id, evento_id, wompi_cuenta_id, wompi_reference, wompi_transaction_id, estado_pago, estado_compra')
        .eq('id', compraBoletasId)
        .maybeSingle()
      compraBoletas = data
    }

    if (!transaccionCheckout && !transaccionProducto) {
      console.error('No se encontró transacción checkout ni de productos para el webhook')
      return new Response(
        JSON.stringify({
          received: true,
          message: 'Transacción no encontrada',
          searched_payment_link_id: paymentLinkId,
          searched_reference: reference,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      )
    }

    const eventoId = transaccionCheckout?.evento_id
      ? Number(transaccionCheckout.evento_id)
      : transaccionProducto?.evento_id
        ? Number(transaccionProducto.evento_id)
        : compraBoletas?.evento_id
          ? Number(compraBoletas.evento_id)
          : null
    let wompiCuentaId =
      (transaccionCheckout?.wompi_cuenta_id as number | null) ??
      (transaccionProducto?.wompi_cuenta_id as number | null) ??
      (compraBoletas?.wompi_cuenta_id as number | null) ??
      null

    if (!wompiCuentaId && eventoId) {
      const { data: eventoData } = await supabaseClient
        .from('eventos')
        .select('wompi_cuenta_id')
        .eq('id', eventoId)
        .maybeSingle()
      wompiCuentaId = eventoData?.wompi_cuenta_id ?? null
    }

    if (!wompiCuentaId && transaccionProductoId && !compraProductoId) {
      const eventoTxnId = transaccionProducto?.evento_id ? Number(transaccionProducto.evento_id) : eventoId
      if (eventoTxnId) {
        const { data: eventoData } = await supabaseClient
          .from('eventos')
          .select('wompi_cuenta_id')
          .eq('id', eventoTxnId)
          .maybeSingle()
        wompiCuentaId = eventoData?.wompi_cuenta_id ?? null
      }
    }

    if (!wompiCuentaId && compraProductoId) {
      const { data: compraProductoData } = await supabaseClient
        .from('compras_productos')
        .select('evento_id, wompi_cuenta_id')
        .eq('id', compraProductoId)
        .maybeSingle()
      wompiCuentaId = compraProductoData?.wompi_cuenta_id ?? null
      if (!wompiCuentaId && compraProductoData?.evento_id) {
        const { data: eventoData } = await supabaseClient
          .from('eventos')
          .select('wompi_cuenta_id')
          .eq('id', compraProductoData.evento_id)
          .maybeSingle()
        wompiCuentaId = eventoData?.wompi_cuenta_id ?? null
      }
    }

    if (wompiCuentaId) {
      const { data: wompiCuenta } = await supabaseClient
        .from('wompi_cuentas')
        .select('id, nombre, events_secret_env, integrity_key_env, activo')
        .eq('id', wompiCuentaId)
        .maybeSingle()

      if (wompiCuenta?.activo) {
        const eventsSecret = resolveSecretByEnvName(wompiCuenta.events_secret_env ?? null)
        const integrityKey = resolveSecretByEnvName(wompiCuenta.integrity_key_env ?? null)
        console.log('Cuenta Wompi resuelta en webhook:', {
          wompiCuentaId,
          nombre: wompiCuenta.nombre,
          hasEventsSecret: !!eventsSecret,
          hasIntegrityKey: !!integrityKey,
        })
      }
    }

    const checkoutTipo = String((transaccionCheckout?.metadata as Record<string, unknown> | null)?.tipo || (transaccionCheckout as Record<string, unknown> | null)?.tipo || '')
      .trim()
      .toLowerCase()
    const checkoutTieneBoletas = !!transaccionCheckout && (checkoutTipo === 'boletas' || checkoutTipo === 'mixto' || hasPedidoBoletas(transaccionCheckout))
    const checkoutTieneProductos = !!transaccionCheckout && (checkoutTipo === 'productos' || checkoutTipo === 'mixto' || hasPedidoProductos(transaccionCheckout))

    if (
      !compraBoletas?.id &&
      transaccionCheckout &&
      checkoutTieneBoletas &&
      String(transaction.status || '').toUpperCase() === 'APPROVED'
    ) {
      const compraIdMaterializada = await crearCompraBoletasDesdeCheckout(
        supabaseClient,
        transaccionCheckout,
        wompiCuentaId,
      )
      const { data: compraData } = await supabaseClient
        .from('compras')
        .select('id, evento_id, wompi_cuenta_id, wompi_reference, wompi_transaction_id, estado_pago, estado_compra')
        .eq('id', compraIdMaterializada)
        .maybeSingle()
      compraBoletas = compraData
      console.log(`✅ Compra boletas materializada desde checkout ${transaccionCheckout.id} -> ${compraIdMaterializada}`)
    }

    if (compraBoletas?.id) {
      await actualizarCompraBoletas(
        supabaseClient,
        Number(compraBoletas.id),
        transaction,
        webhookData,
        wompiCuentaId,
      )
      console.log(`✅ Compra boletas ${compraBoletas.id} actualizada`)
    }

    if (transaccionProductoId) {
      compraProductoId = await procesarTransaccionProducto(
        supabaseClient,
        transaccionProductoId,
        transaction,
        webhookData,
        wompiCuentaId,
      )
      console.log(`✅ Transacción productos ${transaccionProductoId} procesada`, { compraProductoId })
    }

    if (
      !compraProductoId &&
      transaccionCheckout &&
      checkoutTieneProductos &&
      String(transaction.status || '').toUpperCase() === 'APPROVED'
    ) {
      compraProductoId = await crearCompraProductoDesdeCheckout(
        supabaseClient,
        transaccionCheckout,
        wompiCuentaId,
      )
      console.log(`✅ Compra productos materializada desde checkout ${transaccionCheckout.id} -> ${compraProductoId}`)
    }

    // Checkout-only productos (sin transacciones_producto): reflejar estado final en compras_productos.
    if (compraProductoId && !transaccionProductoId) {
      await actualizarCompraProductoDesdeCheckout(
        supabaseClient,
        Number(compraProductoId),
        transaction,
        wompiCuentaId,
      )
    }

    if (transaccionCheckout?.id && isFailedWompiStatus(transaction.status)) {
      await liberarPalcosCheckoutPendiente(supabaseClient, Number(transaccionCheckout.id))
      console.log(`✅ Palcos checkout liberados para intento ${transaccionCheckout.id}`)
    }

    if (transaccionCheckout) {
      await actualizarTransaccionCheckout(
        supabaseClient,
        transaccionCheckout,
        transaction,
        webhookData,
        paymentLinkId,
        reference,
        compraBoletas?.id ? Number(compraBoletas.id) : null,
        compraProductoId,
        transaccionProductoId,
      )
      console.log(`✅ Transacción checkout ${transaccionCheckout.id} actualizada`)
    }

    return new Response(
      JSON.stringify({
        received: true,
        transaccion_checkout_id: transaccionCheckout?.id ? Number(transaccionCheckout.id) : null,
        compra_id: compraBoletas?.id ?? null,
        compra_producto_id: compraProductoId,
        transaccion_producto_id: transaccionProductoId,
        tipo: checkoutTipo || (compraBoletas && transaccionProductoId ? 'mixto' : transaccionProductoId ? 'productos' : 'boletas'),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('=== Error procesando webhook ===', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ received: true, error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  }
})
