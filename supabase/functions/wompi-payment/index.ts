import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/** Versión desplegada — debe coincidir en logs de Supabase al probar checkout de productos. */
const WOMPI_PAYMENT_VERSION = '2.4.4-checkout-only-productos'
// Secret opcional en Supabase (Edge Functions → Secrets): PUBLIC_APP_URL=https://dev.eventumcol.com

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, signature',
}

const ENV_VAR_NAME_REGEX = /^[A-Z][A-Z0-9_]*$/

function resolveCheckoutLinkTtlMinutes(): number {
  const raw = Number(
    Deno.env.get('WOMPI_CHECKOUT_LINK_TTL_MINUTES') ||
    Deno.env.get('WOMPI_PRODUCT_PENDING_TTL_MINUTES') ||
    30,
  )
  if (!Number.isFinite(raw)) return 30
  return Math.min(1440, Math.max(5, Math.floor(raw)))
}

function isUnifiedCheckoutEnabled(): boolean {
  const raw = String(Deno.env.get('CHECKOUT_UNIFICADO_ENABLED') || '').trim().toLowerCase()
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on'
}

function generarNumeroIntentoCheckout(): string {
  return `WCHK-${Date.now()}-${Math.floor(Math.random() * 10000)}`
}

function toObject<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function resolveSecretByEnvName(envVarName: string | null | undefined): string | null {
  const name = String(envVarName || '').trim()
  if (!name) return null
  if (!ENV_VAR_NAME_REGEX.test(name)) {
    throw new Error(`Nombre de variable inválido: "${name}"`)
  }
  const value = Deno.env.get(name)
  return value && value.trim().length > 0 ? value.trim() : null
}

function isMissingRpcError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null
  const message = String(e?.message || '').toLowerCase()
  return (
    e?.code === '42883' ||
    e?.code === 'PGRST202' ||
    (message.includes('function') && message.includes('does not exist'))
  )
}

function isMissingTableError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null
  const message = String(e?.message || '').toLowerCase()
  return (
    e?.code === '42P01' ||
    e?.code === 'PGRST205' ||
    e?.code === 'PGRST204' ||
    (message.includes('could not find') && message.includes('table')) ||
    (message.includes('schema cache') && message.includes('transacciones_producto'))
  )
}

type TipoPago = 'boletas' | 'productos' | 'mixto'

function inferirTipoPago(body: Record<string, unknown>): TipoPago {
  const tipo = String(body.tipo || '').trim().toLowerCase()
  if (tipo === 'productos' || tipo === 'mixto' || tipo === 'boletas') {
    return tipo as TipoPago
  }
  const compraId = body.compra_id
  const pedidoProductos = body.pedido_productos
  const pedidoBoletas = body.pedido_boletas
  if ((compraId || pedidoBoletas) && pedidoProductos) return 'mixto'
  if (pedidoProductos) return 'productos'
  return 'boletas'
}

function buildReference(
  tipo: TipoPago,
  compraId: number | null,
  transaccionProductoId: number | null,
  transaccionCheckoutId?: number | null,
): string {
  const ts = Date.now()
  if (transaccionCheckoutId) {
    return `EVENTUM-CHK-TXN-${transaccionCheckoutId}-${ts}`
  }
  if (tipo === 'mixto' && compraId && transaccionProductoId) {
    return `EVENTUM-MIX-${compraId}-TXN-${transaccionProductoId}-${ts}`
  }
  if (tipo === 'productos' && transaccionProductoId) {
    return `EVENTUM-PROD-TXN-${transaccionProductoId}-${ts}`
  }
  if (compraId) {
    return `EVENTUM-${compraId}-${ts}`
  }
  return `EVENTUM-CHK-${tipo.toUpperCase()}-${ts}`
}

interface PedidoProductosPayload {
  evento_id: number
  cliente_id: number
  items: Array<{ producto_id: number; cantidad: number; precio_unitario: number }>
  subtotal: number
  porcentaje_servicio: number
  valor_servicio: number
  total: number
  terminos_licor_aceptados?: boolean
}

interface PedidoBoletasPayload {
  evento_id: number
  cliente_id: number
  items: Array<{
    tipo_boleta_id: number
    cantidad: number
    precio_unitario: number
    palco_ids?: number[]
  }>
  subtotal: number
  descuento_total?: number
  porcentaje_servicio: number
  valor_servicio: number
  total: number
  cupon_id?: number | null
}

function parsePedidoBoletas(raw: unknown): PedidoBoletasPayload {
  if (!raw || typeof raw !== 'object') {
    throw new Error('pedido_boletas es requerido para pagos de boletas unificados')
  }
  const pedido = raw as Record<string, unknown>
  const items = Array.isArray(pedido.items) ? pedido.items : []
  if (items.length === 0) {
    throw new Error('pedido_boletas.items no puede estar vacío')
  }

  return {
    evento_id: Number(pedido.evento_id),
    cliente_id: Number(pedido.cliente_id),
    items: items.map((item) => {
      const row = item as Record<string, unknown>
      const palcoIds = Array.isArray(row.palco_ids)
        ? row.palco_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
        : undefined
      return {
        tipo_boleta_id: Number(row.tipo_boleta_id),
        cantidad: Number(row.cantidad),
        precio_unitario: Number(row.precio_unitario),
        palco_ids: palcoIds,
      }
    }),
    subtotal: Number(pedido.subtotal),
    descuento_total: Number(pedido.descuento_total ?? 0),
    porcentaje_servicio: Number(pedido.porcentaje_servicio ?? 0),
    valor_servicio: Number(pedido.valor_servicio ?? 0),
    total: Number(pedido.total),
    cupon_id: pedido.cupon_id != null ? Number(pedido.cupon_id) : null,
  }
}

function extractPalcoIdsFromPedidoBoletas(pedido: PedidoBoletasPayload | null): number[] {
  if (!pedido) return []
  const ids: number[] = []
  for (const item of pedido.items || []) {
    if (!Array.isArray(item.palco_ids)) continue
    for (const rawId of item.palco_ids) {
      const id = Number(rawId)
      if (Number.isFinite(id) && id > 0) ids.push(id)
    }
  }
  return [...new Set(ids)]
}

function parsePedidoProductos(raw: unknown): PedidoProductosPayload {
  if (!raw || typeof raw !== 'object') {
    throw new Error('pedido_productos es requerido para pagos de productos')
  }
  const pedido = raw as Record<string, unknown>
  const items = Array.isArray(pedido.items) ? pedido.items : []
  if (items.length === 0) {
    throw new Error('pedido_productos.items no puede estar vacío')
  }
  return {
    evento_id: Number(pedido.evento_id),
    cliente_id: Number(pedido.cliente_id),
    items: items.map((item) => {
      const row = item as Record<string, unknown>
      return {
        producto_id: Number(row.producto_id),
        cantidad: Number(row.cantidad),
        precio_unitario: Number(row.precio_unitario),
      }
    }),
    subtotal: Number(pedido.subtotal),
    porcentaje_servicio: Number(pedido.porcentaje_servicio ?? 0),
    valor_servicio: Number(pedido.valor_servicio ?? 0),
    total: Number(pedido.total),
    terminos_licor_aceptados: !!pedido.terminos_licor_aceptados,
  }
}

async function resolveWompiCredentials(
  supabaseClient: ReturnType<typeof createClient>,
  eventoId: number | null | undefined,
  wompiCuentaIdHint: number | null | undefined,
): Promise<{ wompiPrivateKey: string; wompiEnvironment: string; wompiCuentaId: number | null }> {
  let wompiPrivateKey = (Deno.env.get('WOMPI_PRIVATE_KEY') || '').trim()
  let wompiEnvironment = (Deno.env.get('WOMPI_ENVIRONMENT') || 'sandbox').trim().toLowerCase()
  let wompiCuentaId = wompiCuentaIdHint ?? null

  if (!wompiCuentaId && eventoId) {
    const { data: eventoData } = await supabaseClient
      .from('eventos')
      .select('wompi_cuenta_id')
      .eq('id', eventoId)
      .maybeSingle()
    wompiCuentaId = eventoData?.wompi_cuenta_id ?? null
  }

  if (wompiCuentaId) {
    const { data: wompiCuenta, error: wompiCuentaError } = await supabaseClient
      .from('wompi_cuentas')
      .select('id, nombre, private_key_env, environment_env, activo')
      .eq('id', wompiCuentaId)
      .single()

    if (wompiCuentaError || !wompiCuenta) {
      throw new Error(`No se pudo cargar la cuenta Wompi (id=${wompiCuentaId})`)
    }
    if (!wompiCuenta.activo) {
      throw new Error(`La cuenta Wompi asignada está inactiva (id=${wompiCuentaId})`)
    }

    const privateKeyFromSecret = resolveSecretByEnvName(wompiCuenta.private_key_env)
    if (!privateKeyFromSecret) {
      throw new Error(
        `No existe valor para la variable ${wompiCuenta.private_key_env} (cuenta Wompi id=${wompiCuentaId})`,
      )
    }
    wompiPrivateKey = privateKeyFromSecret

    const envFromSecret = resolveSecretByEnvName(wompiCuenta.environment_env ?? null)
    if (envFromSecret) {
      wompiEnvironment = envFromSecret.toLowerCase()
    }
  }

  if (!wompiPrivateKey) {
    throw new Error('Wompi Private Key no configurado (requerido para payment_links)')
  }

  return { wompiPrivateKey, wompiEnvironment, wompiCuentaId }
}

function resolveRedirectUrl(
  requestedRedirectUrl: string | undefined,
  fallbackRedirectUrl: string,
): string {
  const publicAppUrl = (Deno.env.get('PUBLIC_APP_URL') || '').trim().replace(/\/+$/, '')
  const requested =
    typeof requestedRedirectUrl === 'string' && requestedRedirectUrl.trim().length > 0
      ? requestedRedirectUrl.trim()
      : null

  let baseUrl = fallbackRedirectUrl
  if (requested) {
    const isLocalRedirect = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(requested)
    // Preferir la URL del navegador (dev/prod) salvo que sea localhost y exista PUBLIC_APP_URL.
    if (!isLocalRedirect || !publicAppUrl) {
      baseUrl = requested
    }
  }

  try {
    const resultUrl = new URL(baseUrl)
    const fbUrl = new URL(fallbackRedirectUrl)
    if (!resultUrl.pathname.includes('pago-resultado')) {
      resultUrl.pathname = fbUrl.pathname
    }
    for (const [key, value] of fbUrl.searchParams.entries()) {
      if (!resultUrl.searchParams.has(key)) {
        resultUrl.searchParams.set(key, value)
      }
    }
    return resultUrl.toString()
  } catch {
    return fallbackRedirectUrl
  }
}

async function crearTransaccionPendienteProductos(
  supabaseClient: ReturnType<typeof createClient>,
  pedido: PedidoProductosPayload,
  wompiCuentaId: number | null,
): Promise<number> {
  const { data: created, error } = await supabaseClient
    .from('transacciones_producto')
    .insert({
      compra_producto_id: null,
      evento_id: pedido.evento_id,
      cliente_id: pedido.cliente_id,
      wompi_cuenta_id: wompiCuentaId,
      numero_transaccion: `WPROD-PEND-${Date.now()}`,
      monto: pedido.total,
      monto_centavos: Math.round(pedido.total * 100),
      moneda: 'COP',
      estado: 'pendiente',
      es_activa: true,
      request_payload: { pedido },
    })
    .select('id')
    .single()

  if (error || !created) {
    if (error) throw error
    throw new Error('No se pudo crear transacción pendiente de productos')
  }

  return created.id
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('=== Iniciando wompi-payment ===', WOMPI_PAYMENT_VERSION)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase URL o Service Role Key no configurados')
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)

    let requestBody: Record<string, unknown>
    try {
      requestBody = await req.json()
      console.log('Request body recibido:', requestBody)
    } catch (jsonError) {
      console.error('Error parseando JSON:', jsonError)
      throw new Error('Error al parsear el cuerpo de la solicitud: ' + (jsonError as Error).message)
    }

    const tipo = inferirTipoPago(requestBody)
    const unifiedCheckoutEnabled = isUnifiedCheckoutEnabled()
    const compraId = requestBody.compra_id ? Number(requestBody.compra_id) : null
    const pedidoBoletasRaw = requestBody.pedido_boletas
    const pedidoProductosRaw = requestBody.pedido_productos
    const amountInCents = requestBody.amount_in_cents ? Number(requestBody.amount_in_cents) : null
    const redirectUrl = typeof requestBody.redirect_url === 'string' ? requestBody.redirect_url : undefined
    const customerEmail = typeof requestBody.customer_email === 'string' ? requestBody.customer_email : undefined

    if (tipo === 'boletas' && !compraId && !unifiedCheckoutEnabled) {
      throw new Error('compra_id es requerido para pagos de boletas cuando CHECKOUT_UNIFICADO_ENABLED=false')
    }
    if (tipo === 'boletas' && !compraId && unifiedCheckoutEnabled && !pedidoBoletasRaw) {
      throw new Error('pedido_boletas es requerido para pagos de boletas unificados')
    }
    if ((tipo === 'productos' || tipo === 'mixto') && !pedidoProductosRaw) {
      throw new Error('pedido_productos es requerido para pagos de productos')
    }
    if (tipo === 'mixto' && !compraId && !unifiedCheckoutEnabled) {
      throw new Error('compra_id es requerido para pagos mixtos cuando CHECKOUT_UNIFICADO_ENABLED=false')
    }
    if (tipo === 'mixto' && !compraId && unifiedCheckoutEnabled && !pedidoBoletasRaw) {
      throw new Error('pedido_boletas es requerido para pagos mixtos unificados')
    }

    let pedidoProductos: PedidoProductosPayload | null = null
    let pedidoBoletas: PedidoBoletasPayload | null = null
    if (pedidoBoletasRaw) {
      pedidoBoletas = parsePedidoBoletas(pedidoBoletasRaw)
    }
    if (pedidoProductosRaw) {
      pedidoProductos = parsePedidoProductos(pedidoProductosRaw)
    }

    let compra: Record<string, unknown> | null = null
    let eventoTitulo = 'Evento'
    let eventoId: number | null = null
    let clienteId: number | null = null
    let wompiCuentaHint: number | null = null
    let totalEsperado = 0

    if (compraId) {
      const { data, error } = await supabaseClient
        .from('compras')
        .select('*, eventos!inner(id, titulo, wompi_cuenta_id)')
        .eq('id', compraId)
        .single()

      if (error || !data) {
        throw new Error('Error al obtener la compra de boletas: ' + (error?.message || 'no encontrada'))
      }
      compra = data
      const evento = toObject<{ id?: number; titulo?: string; wompi_cuenta_id?: number | null }>(data.eventos)
      eventoTitulo = evento?.titulo || eventoTitulo
      eventoId = evento?.id ?? Number(data.evento_id)
      clienteId = Number(data.cliente_id)
      wompiCuentaHint = (data.wompi_cuenta_id as number | null) ?? evento?.wompi_cuenta_id ?? null
      totalEsperado += Number(data.total || 0)
    }

    if (pedidoBoletas) {
      eventoId = eventoId ?? pedidoBoletas.evento_id
      clienteId = clienteId ?? pedidoBoletas.cliente_id
      if (!compraId) {
        totalEsperado += pedidoBoletas.total
      }
      if (eventoId !== pedidoBoletas.evento_id) {
        throw new Error('Las compras mixtas deben pertenecer al mismo evento')
      }
      if (clienteId && clienteId !== pedidoBoletas.cliente_id) {
        throw new Error('Las compras mixtas deben pertenecer al mismo cliente')
      }

      const { data: eventoBoletas } = await supabaseClient
        .from('eventos')
        .select('id, titulo, wompi_cuenta_id')
        .eq('id', pedidoBoletas.evento_id)
        .single()

      if (!eventoBoletas) {
        throw new Error('Evento de boletas no encontrado')
      }
      eventoTitulo = eventoBoletas.titulo || eventoTitulo
      wompiCuentaHint = wompiCuentaHint ?? eventoBoletas.wompi_cuenta_id ?? null
    }

    if (pedidoProductos) {
      eventoId = eventoId ?? pedidoProductos.evento_id
      clienteId = clienteId ?? pedidoProductos.cliente_id
      totalEsperado += pedidoProductos.total

      if (eventoId !== pedidoProductos.evento_id) {
        throw new Error('Las compras mixtas deben pertenecer al mismo evento')
      }
      if (clienteId && clienteId !== pedidoProductos.cliente_id) {
        throw new Error('Las compras mixtas deben pertenecer al mismo cliente')
      }

      const { data: eventoProductos } = await supabaseClient
        .from('eventos')
        .select('id, titulo, wompi_cuenta_id')
        .eq('id', pedidoProductos.evento_id)
        .single()

      if (!eventoProductos) {
        throw new Error('Evento de productos no encontrado')
      }
      eventoTitulo = eventoProductos.titulo || eventoTitulo
      wompiCuentaHint = wompiCuentaHint ?? eventoProductos.wompi_cuenta_id ?? null
    }

    const { wompiPrivateKey, wompiEnvironment, wompiCuentaId } = await resolveWompiCredentials(
      supabaseClient,
      eventoId,
      wompiCuentaHint,
    )

    const montoCentavos = amountInCents ?? Math.round(totalEsperado * 100)
    const montoEsperadoCentavos = Math.round(totalEsperado * 100)
    if (Math.abs(montoCentavos - montoEsperadoCentavos) > 1) {
      throw new Error(
        `El monto enviado (${montoCentavos}) no coincide con el total esperado (${montoEsperadoCentavos})`,
      )
    }

    let clienteEmail = customerEmail || ''
    if (!clienteEmail && clienteId) {
      const { data: cliente, error: clienteError } = await supabaseClient
        .from('usuarios')
        .select('email')
        .eq('id', clienteId)
        .single()
      if (clienteError || !cliente) {
        throw new Error('Error al obtener el cliente: ' + (clienteError?.message || 'no encontrado'))
      }
      clienteEmail = cliente.email || ''
    }

    const wompiBaseUrl = wompiEnvironment === 'production'
      ? 'https://production.wompi.co/v1'
      : 'https://sandbox.wompi.co/v1'
    const publicAppUrl = (Deno.env.get('PUBLIC_APP_URL') || '').trim().replace(/\/+$/, '')

    let transaccionProductoId: number | null = null
    if (pedidoProductos) {
      try {
        transaccionProductoId = await crearTransaccionPendienteProductos(
          supabaseClient,
          pedidoProductos,
          wompiCuentaId,
        )
      } catch (err) {
        if (isMissingTableError(err)) {
          console.warn('transacciones_producto no existe; continuando con checkout-only para productos')
          transaccionProductoId = null
        } else {
          throw err
        }
      }
    }

    const shouldPersistCheckout = !!(clienteId && eventoId && (pedidoProductos || unifiedCheckoutEnabled))

    let transaccionCheckoutId: number | null = null
    if (shouldPersistCheckout) {
      const { data: checkoutDraft, error: checkoutDraftError } = await supabaseClient
        .from('transacciones_checkout')
        .insert({
          tipo,
          cliente_id: clienteId,
          evento_id: eventoId,
          wompi_cuenta_id: wompiCuentaId,
          compra_id: compraId,
          compra_producto_id: null,
          numero_intento: generarNumeroIntentoCheckout(),
          subtotal: totalEsperado,
          descuento_total: pedidoBoletas?.descuento_total ?? 0,
          porcentaje_servicio: pedidoBoletas?.porcentaje_servicio ?? pedidoProductos?.porcentaje_servicio ?? 0,
          valor_servicio: pedidoBoletas?.valor_servicio ?? pedidoProductos?.valor_servicio ?? 0,
          total: totalEsperado,
          monto_centavos: montoCentavos,
          moneda: 'COP',
          estado: 'pendiente',
          es_activa: true,
          request_payload: {
            request_body: requestBody,
            pedido_boletas: pedidoBoletas,
            pedido_productos: pedidoProductos,
          },
          metadata: {
            compra_id: compraId,
            transaccion_producto_id: transaccionProductoId,
          },
          flow_version: 'v1-unificado',
        })
        .select('id')
        .single()

      if (checkoutDraftError) {
        console.warn('No se pudo crear borrador transaccion_checkout:', checkoutDraftError.message)
      } else {
        transaccionCheckoutId = Number(checkoutDraft?.id)
      }
    }

    if (pedidoProductos && !transaccionCheckoutId && !transaccionProductoId) {
      throw new Error('No se pudo persistir el intento de productos en checkout')
    }

    if (transaccionCheckoutId && unifiedCheckoutEnabled && pedidoBoletas) {
      const palcoIdsCheckout = extractPalcoIdsFromPedidoBoletas(pedidoBoletas)
      if (palcoIdsCheckout.length > 0) {
        const { error: reservarCheckoutError } = await supabaseClient.rpc('reservar_palcos_checkout', {
          p_transaccion_checkout_id: transaccionCheckoutId,
          p_palco_ids: palcoIdsCheckout,
        })
        if (reservarCheckoutError && !isMissingRpcError(reservarCheckoutError)) {
          throw new Error(`No se pudo reservar palcos para checkout: ${reservarCheckoutError.message}`)
        }
      }
    }

    const reference = buildReference(tipo, compraId, transaccionProductoId, transaccionCheckoutId)

    const query = new URLSearchParams()
    if (compraId) query.set('compra_id', String(compraId))
    if (transaccionProductoId) query.set('transaccion_producto_id', String(transaccionProductoId))
    if (transaccionCheckoutId) query.set('transaccion_checkout_id', String(transaccionCheckoutId))
    query.set('reference', reference)
    const fallbackRedirectUrl = publicAppUrl
      ? `${publicAppUrl}/pago-resultado?${query.toString()}`
      : `http://localhost:4200/pago-resultado?${query.toString()}`
    const redirectUrlFinal = resolveRedirectUrl(redirectUrl, fallbackRedirectUrl)

    const paymentName = (() => {
      if (tipo === 'mixto') return `Compra mixta ${compraId ?? 'CHK'}/TXN-${transaccionProductoId ?? 'CHK'} - ${eventoTitulo}`
      if (tipo === 'productos') return `Pedido productos TXN-${transaccionProductoId ?? 'CHK'} - ${eventoTitulo}`
      return `Compra ${compraId ?? 'CHK'} - ${eventoTitulo}`
    })()

    const paymentDescription = (() => {
      if (tipo === 'mixto') {
        return `Pago combinado boletas #${compraId ?? 'CHK'} + productos (TXN ${transaccionProductoId ?? 'CHK'})`
      }
      if (tipo === 'productos') {
        return `Pago pedido productos (TXN ${transaccionProductoId ?? 'CHK'})`
      }
      return `Pago para compra #${compraId ?? 'CHK'}`
    })()

    const paymentLinkRequest: Record<string, unknown> = {
      name: paymentName,
      description: paymentDescription,
      single_use: true,
      collect_shipping: false,
      currency: 'COP',
      amount_in_cents: montoCentavos,
      redirect_url: redirectUrlFinal,
      reference,
    }

    // Aplicar expiración a todos los links (legacy y unificado) evita pendientes eternos.
    const ttlMinutes = resolveCheckoutLinkTtlMinutes()
    paymentLinkRequest.expires_at = new Date(Date.now() + ttlMinutes * 60_000).toISOString()

    console.log('Payment link request:', JSON.stringify(paymentLinkRequest, null, 2))

    const wompiResponse = await fetch(`${wompiBaseUrl}/payment_links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${wompiPrivateKey}`,
      },
      body: JSON.stringify(paymentLinkRequest),
    })

    let wompiData = await wompiResponse.json()
    console.log('Payment link response:', JSON.stringify(wompiData, null, 2))

    if (!wompiResponse.ok) {
      throw new Error(
        wompiData.error?.message || wompiData.error?.reason || 'Error al crear transacción/enlace en Wompi',
      )
    }

    if (wompiData.data) {
      const linkId = wompiData.data.id
      wompiData = {
        data: {
          id: linkId,
          checkout_url: `https://checkout.wompi.co/l/${linkId}`,
          status: 'PENDING',
          reference,
          payment_link_id: linkId,
        },
      }
    }

    const paymentLinkId = wompiData.data?.payment_link_id || wompiData.data?.id

    if (compraId && compra) {
      const { error: updateError } = await supabaseClient
        .from('compras')
        .update({
          wompi_transaction_id: paymentLinkId,
          wompi_reference: reference,
          wompi_cuenta_id: wompiCuentaId,
          wompi_payment_method: null,
          wompi_payment_method_type: null,
          wompi_status: wompiData.data?.status || 'PENDING',
          wompi_response: wompiData,
        })
        .eq('id', compraId)

      if (updateError) {
        console.error('Error actualizando compra de boletas:', updateError)
      }
    }

    if (transaccionProductoId && pedidoProductos) {
      const { error: updateTransaccionError } = await supabaseClient
        .from('transacciones_producto')
        .update({
          wompi_cuenta_id: wompiCuentaId,
          wompi_transaction_id: paymentLinkId,
          wompi_reference: reference,
          wompi_status: wompiData.data?.status || 'PENDING',
          checkout_url: wompiData.data?.checkout_url,
          redirect_url: redirectUrlFinal,
          request_payload: { pedido: pedidoProductos, payment_link: paymentLinkRequest },
          response_payload: wompiData,
          fecha_actualizacion: new Date().toISOString(),
        })
        .eq('id', transaccionProductoId)

      if (updateTransaccionError) {
        console.error('Error actualizando transacción de producto:', updateTransaccionError)
      }
    }

    if (shouldPersistCheckout) {
      const checkoutStatus = String(wompiData.data?.status || 'PENDING').toUpperCase()
      const expiresAt = typeof paymentLinkRequest.expires_at === 'string'
        ? paymentLinkRequest.expires_at
        : null

      if (transaccionCheckoutId) {
        const { error: checkoutUpdateError } = await supabaseClient
          .from('transacciones_checkout')
          .update({
            wompi_transaction_id: paymentLinkId,
            wompi_reference: reference,
            wompi_status: checkoutStatus,
            checkout_url: wompiData.data?.checkout_url,
            redirect_url: redirectUrlFinal,
            request_payload: {
              request_body: requestBody,
              pedido_boletas: pedidoBoletas,
              pedido_productos: pedidoProductos,
              payment_link: paymentLinkRequest,
            },
            response_payload: wompiData,
            expires_at: expiresAt,
          })
          .eq('id', transaccionCheckoutId)

        if (checkoutUpdateError) {
          console.warn('No se pudo actualizar transaccion_checkout borrador:', checkoutUpdateError.message)
        }
      } else {
        const { data: checkout, error: checkoutError } = await supabaseClient
          .from('transacciones_checkout')
          .insert({
            tipo,
            cliente_id: clienteId,
            evento_id: eventoId,
            wompi_cuenta_id: wompiCuentaId,
            compra_id: compraId,
            compra_producto_id: null,
            numero_intento: generarNumeroIntentoCheckout(),
            wompi_transaction_id: paymentLinkId,
            wompi_reference: reference,
            wompi_status: checkoutStatus,
            subtotal: totalEsperado,
            descuento_total: pedidoBoletas?.descuento_total ?? 0,
            porcentaje_servicio: pedidoBoletas?.porcentaje_servicio ?? pedidoProductos?.porcentaje_servicio ?? 0,
            valor_servicio: pedidoBoletas?.valor_servicio ?? pedidoProductos?.valor_servicio ?? 0,
            total: totalEsperado,
            monto_centavos: montoCentavos,
            moneda: 'COP',
            estado: 'pendiente',
            es_activa: true,
            checkout_url: wompiData.data?.checkout_url,
            redirect_url: redirectUrlFinal,
            request_payload: {
              request_body: requestBody,
              pedido_boletas: pedidoBoletas,
              pedido_productos: pedidoProductos,
              payment_link: paymentLinkRequest,
            },
            response_payload: wompiData,
            metadata: {
              compra_id: compraId,
              transaccion_producto_id: transaccionProductoId,
            },
            expires_at: expiresAt,
            flow_version: 'v1-unificado',
          })
          .select('id')
          .single()

        if (checkoutError) {
          console.warn('No se pudo crear transaccion_checkout (continuando en legacy):', checkoutError.message)
        } else {
          transaccionCheckoutId = Number(checkout?.id)
        }
      }
    }

    console.log('Pago creado:', { tipo, compraId, transaccionProductoId, reference, paymentLinkId, clienteEmail })

    return new Response(
      JSON.stringify({
        success: true,
        version: WOMPI_PAYMENT_VERSION,
        tipo,
        transaccion_producto_id: transaccionProductoId,
        transaccion_checkout_id: transaccionCheckoutId,
        transaction: wompiData.data,
        checkout_url: wompiData.data?.checkout_url || wompiData.data?.permalink,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('=== Error en wompi-payment ===', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({
        success: false,
        version: WOMPI_PAYMENT_VERSION,
        error: errorMessage,
        details: error instanceof Error ? error.stack : undefined,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})
