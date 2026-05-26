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

function parseReference(reference: string | null | undefined): {
  tipo: TipoPago | null
  compraId: number | null
  compraProductoId: number | null
  transaccionProductoId: number | null
} {
  const ref = String(reference || '').trim()
  if (!ref) {
    return { tipo: null, compraId: null, compraProductoId: null, transaccionProductoId: null }
  }

  const mixMatch = ref.match(/^EVENTUM-MIX-(\d+)-TXN-(\d+)-/i)
  if (mixMatch) {
    return {
      tipo: 'mixto',
      compraId: Number(mixMatch[1]),
      compraProductoId: null,
      transaccionProductoId: Number(mixMatch[2]),
    }
  }

  const mixLegacyMatch = ref.match(/^EVENTUM-MIX-(\d+)-(\d+)-/i)
  if (mixLegacyMatch) {
    return {
      tipo: 'mixto',
      compraId: Number(mixLegacyMatch[1]),
      compraProductoId: Number(mixLegacyMatch[2]),
      transaccionProductoId: null,
    }
  }

  const prodTxnMatch = ref.match(/^EVENTUM-PROD-TXN-(\d+)-/i)
  if (prodTxnMatch) {
    return {
      tipo: 'productos',
      compraId: null,
      compraProductoId: null,
      transaccionProductoId: Number(prodTxnMatch[1]),
    }
  }

  const prodMatch = ref.match(/^EVENTUM-PROD-(\d+)-/i)
  if (prodMatch) {
    return {
      tipo: 'productos',
      compraId: null,
      compraProductoId: Number(prodMatch[1]),
      transaccionProductoId: null,
    }
  }

  const boletaMatch = ref.match(/^EVENTUM-(\d+)-/i)
  if (boletaMatch) {
    return {
      tipo: 'boletas',
      compraId: Number(boletaMatch[1]),
      compraProductoId: null,
      transaccionProductoId: null,
    }
  }

  return { tipo: null, compraId: null, compraProductoId: null, transaccionProductoId: null }
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
  } else if (transaction.status === 'DECLINED' || transaction.status === 'VOIDED') {
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

    let compraBoletas: Record<string, unknown> | null = null
    let transaccionProducto: Record<string, unknown> | null = null

    if (paymentLinkId) {
      const { data: compraData } = await supabaseClient
        .from('compras')
        .select('id, evento_id, wompi_cuenta_id, wompi_reference, wompi_transaction_id, estado_pago, estado_compra')
        .eq('wompi_transaction_id', paymentLinkId)
        .maybeSingle()
      compraBoletas = compraData

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
      : parsedRef.compraProductoId

    const compraBoletasId = compraBoletas?.id ? Number(compraBoletas.id) : parsedRef.compraId

    if (!compraBoletas && compraBoletasId) {
      const { data } = await supabaseClient
        .from('compras')
        .select('id, evento_id, wompi_cuenta_id, wompi_reference, wompi_transaction_id, estado_pago, estado_compra')
        .eq('id', compraBoletasId)
        .maybeSingle()
      compraBoletas = data
    }

    if (!compraBoletas && !transaccionProducto) {
      console.error('No se encontró compra de boletas ni de productos para el webhook')
      return new Response(
        JSON.stringify({
          received: true,
          message: 'Compra no encontrada',
          searched_payment_link_id: paymentLinkId,
          searched_reference: reference,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      )
    }

    let wompiCuentaId =
      (compraBoletas?.wompi_cuenta_id as number | null) ??
      (transaccionProducto?.wompi_cuenta_id as number | null) ??
      null

    const eventoId = compraBoletas?.evento_id
      ? Number(compraBoletas.evento_id)
      : transaccionProducto?.evento_id
        ? Number(transaccionProducto.evento_id)
        : null
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

    return new Response(
      JSON.stringify({
        received: true,
        compra_id: compraBoletas?.id ?? null,
        compra_producto_id: compraProductoId,
        transaccion_producto_id: transaccionProductoId,
        tipo: parsedRef.tipo || (compraBoletas && transaccionProductoId ? 'mixto' : transaccionProductoId ? 'productos' : 'boletas'),
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
