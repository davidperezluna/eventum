import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/** Versión desplegada — checkout unificado + covers independientes (pedido_covers). */
const WOMPI_PAYMENT_VERSION = '3.1.0-covers-independiente'
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

type TipoPago = 'boletas' | 'productos' | 'mixto' | 'cover' | 'cover_mixto'

function tipoEsMixto(tipo: TipoPago): boolean {
  return tipo === 'mixto' || tipo === 'cover_mixto'
}

function tipoRequiereProductos(tipo: TipoPago): boolean {
  return tipo === 'productos' || tipo === 'mixto' || tipo === 'cover_mixto'
}

function inferirTipoPago(body: Record<string, unknown>): TipoPago {
  const tipo = String(body.tipo || '').trim().toLowerCase()
  const tiposValidos: TipoPago[] = ['productos', 'mixto', 'boletas', 'cover', 'cover_mixto']
  if (tiposValidos.includes(tipo as TipoPago)) {
    return tipo as TipoPago
  }
  const pedidoProductos = body.pedido_productos
  const pedidoCovers = body.pedido_covers
  const pedidoBoletas = body.pedido_boletas
  if (pedidoCovers && pedidoProductos) return 'cover_mixto'
  if (pedidoCovers) return 'cover'
  if (pedidoBoletas && pedidoProductos) return 'mixto'
  if (pedidoProductos) return 'productos'
  return 'boletas'
}

function buildReference(transaccionCheckoutId: number): string {
  return `EVENTUM-CHK-TXN-${transaccionCheckoutId}-${Date.now()}`
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

interface PedidoCoversPayload {
  lugar_id: number
  cliente_id: number
  items: Array<{
    tipo_cover_id: number
    sesion_cover_id: number
    cantidad: number
    precio_unitario: number
  }>
  subtotal: number
  descuento_total?: number
  porcentaje_servicio: number
  valor_servicio: number
  total: number
  cupon_id?: number | null
  wompi_cuenta_id?: number | null
}

function parsePedidoCovers(raw: unknown): PedidoCoversPayload {
  if (!raw || typeof raw !== 'object') {
    throw new Error('pedido_covers es requerido para pagos de cover')
  }
  const pedido = raw as Record<string, unknown>
  const items = Array.isArray(pedido.items) ? pedido.items : []
  if (items.length === 0) {
    throw new Error('pedido_covers.items no puede estar vacío')
  }
  return {
    lugar_id: Number(pedido.lugar_id),
    cliente_id: Number(pedido.cliente_id),
    items: items.map((item) => {
      const row = item as Record<string, unknown>
      return {
        tipo_cover_id: Number(row.tipo_cover_id),
        sesion_cover_id: Number(row.sesion_cover_id),
        cantidad: Number(row.cantidad),
        precio_unitario: Number(row.precio_unitario),
      }
    }),
    subtotal: Number(pedido.subtotal),
    descuento_total: Number(pedido.descuento_total ?? 0),
    porcentaje_servicio: Number(pedido.porcentaje_servicio ?? 0),
    valor_servicio: Number(pedido.valor_servicio ?? 0),
    total: Number(pedido.total),
    cupon_id: pedido.cupon_id != null ? Number(pedido.cupon_id) : null,
    wompi_cuenta_id: pedido.wompi_cuenta_id != null ? Number(pedido.wompi_cuenta_id) : null,
  }
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
    const pedidoBoletasRaw = requestBody.pedido_boletas
    const pedidoCoversRaw = requestBody.pedido_covers
    const pedidoProductosRaw = requestBody.pedido_productos
    const amountInCents = requestBody.amount_in_cents ? Number(requestBody.amount_in_cents) : null
    const redirectUrl = typeof requestBody.redirect_url === 'string' ? requestBody.redirect_url : undefined
    const customerEmail = typeof requestBody.customer_email === 'string' ? requestBody.customer_email : undefined

    if (requestBody.compra_id) {
      throw new Error('compra_id ya no es soportado; envíe pedido_boletas y/o pedido_productos')
    }

    if (tipo === 'boletas' && !pedidoBoletasRaw) {
      throw new Error('pedido_boletas es requerido para pagos de boletas')
    }
    if (tipo === 'cover' && !pedidoCoversRaw) {
      throw new Error('pedido_covers es requerido para pagos de cover')
    }
    if (tipoRequiereProductos(tipo) && !pedidoProductosRaw) {
      throw new Error('pedido_productos es requerido para pagos de productos')
    }
    if (tipo === 'mixto' && !pedidoBoletasRaw) {
      throw new Error('pedido_boletas es requerido para pagos mixtos')
    }
    if (tipo === 'cover_mixto' && (!pedidoCoversRaw || !pedidoProductosRaw)) {
      throw new Error('pedido_covers y pedido_productos son requeridos para cover_mixto')
    }

    let pedidoProductos: PedidoProductosPayload | null = null
    let pedidoBoletas: PedidoBoletasPayload | null = null
    let pedidoCovers: PedidoCoversPayload | null = null
    if (pedidoBoletasRaw) {
      pedidoBoletas = parsePedidoBoletas(pedidoBoletasRaw)
    }
    if (pedidoCoversRaw) {
      pedidoCovers = parsePedidoCovers(pedidoCoversRaw)
    }
    if (pedidoProductosRaw) {
      pedidoProductos = parsePedidoProductos(pedidoProductosRaw)
    }

    let eventoTitulo = 'Evento'
    let eventoId: number | null = null
    let lugarId: number | null = null
    let clienteId: number | null = null
    let wompiCuentaHint: number | null = null
    let totalEsperado = 0

    if (pedidoCovers) {
      lugarId = pedidoCovers.lugar_id
      clienteId = pedidoCovers.cliente_id
      totalEsperado += pedidoCovers.total
      wompiCuentaHint = pedidoCovers.wompi_cuenta_id ?? null

      const { data: lugar } = await supabaseClient
        .from('lugares')
        .select('id, nombre')
        .eq('id', pedidoCovers.lugar_id)
        .single()
      if (!lugar) {
        throw new Error('Lugar del cover no encontrado')
      }
      eventoTitulo = `Covers — ${lugar.nombre}`

      if (!wompiCuentaHint && pedidoCovers.items.length > 0) {
        const tipoCoverId = pedidoCovers.items[0].tipo_cover_id
        const { data: tipoCover } = await supabaseClient
          .from('tipos_cover')
          .select('wompi_cuenta_id')
          .eq('id', tipoCoverId)
          .maybeSingle()
        wompiCuentaHint = tipoCover?.wompi_cuenta_id ?? null
      }
    }

    if (pedidoBoletas) {
      eventoId = pedidoBoletas.evento_id
      clienteId = pedidoBoletas.cliente_id
      totalEsperado += pedidoBoletas.total

      const { data: eventoBoletas } = await supabaseClient
        .from('eventos')
        .select('id, titulo, wompi_cuenta_id')
        .eq('id', pedidoBoletas.evento_id)
        .single()

      if (!eventoBoletas) {
        throw new Error('Evento de boletas no encontrado')
      }
      eventoTitulo = eventoBoletas.titulo || eventoTitulo
      wompiCuentaHint = eventoBoletas.wompi_cuenta_id ?? null
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

    const shouldPersistCheckout = !!(clienteId && (eventoId || lugarId))

    let transaccionCheckoutId: number | null = null
    if (shouldPersistCheckout) {
      const { data: checkoutDraft, error: checkoutDraftError } = await supabaseClient
        .from('transacciones_checkout')
        .insert({
          tipo,
          cliente_id: clienteId,
          evento_id: eventoId,
          lugar_id: lugarId,
          wompi_cuenta_id: wompiCuentaId,
          compra_id: null,
          compra_producto_id: null,
          compra_cover_id: null,
          numero_intento: generarNumeroIntentoCheckout(),
          subtotal: totalEsperado,
          descuento_total: pedidoBoletas?.descuento_total ?? pedidoCovers?.descuento_total ?? 0,
          porcentaje_servicio: pedidoBoletas?.porcentaje_servicio ?? pedidoCovers?.porcentaje_servicio ?? pedidoProductos?.porcentaje_servicio ?? 0,
          valor_servicio: pedidoBoletas?.valor_servicio ?? pedidoCovers?.valor_servicio ?? pedidoProductos?.valor_servicio ?? 0,
          total: totalEsperado,
          monto_centavos: montoCentavos,
          moneda: 'COP',
          estado: 'pendiente',
          es_activa: true,
          request_payload: {
            request_body: requestBody,
            pedido_boletas: pedidoBoletas,
            pedido_covers: pedidoCovers,
            pedido_productos: pedidoProductos,
          },
          metadata: {
            transaccion_producto_id: transaccionProductoId,
          },
          flow_version: 'v1-unificado',
        })
        .select('id')
        .single()

      if (checkoutDraftError) {
        throw new Error(`No se pudo crear borrador transaccion_checkout: ${checkoutDraftError.message}`)
      }
      transaccionCheckoutId = Number(checkoutDraft?.id)
    }

    if (pedidoProductos && !transaccionCheckoutId && !transaccionProductoId) {
      throw new Error('No se pudo persistir el intento de productos en checkout')
    }

    if (transaccionCheckoutId && pedidoBoletas) {
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

    if (!transaccionCheckoutId) {
      throw new Error('No se pudo crear transaccion_checkout para el pago')
    }

    const reference = buildReference(transaccionCheckoutId)

    const query = new URLSearchParams()
    if (transaccionProductoId) query.set('transaccion_producto_id', String(transaccionProductoId))
    if (transaccionCheckoutId) query.set('transaccion_checkout_id', String(transaccionCheckoutId))
    query.set('reference', reference)
    const fallbackRedirectUrl = publicAppUrl
      ? `${publicAppUrl}/pago-resultado?${query.toString()}`
      : `http://localhost:4200/pago-resultado?${query.toString()}`
    const redirectUrlFinal = resolveRedirectUrl(redirectUrl, fallbackRedirectUrl)

    const paymentName = (() => {
      if (tipoEsMixto(tipo)) {
        const etiqueta = tipo === 'cover_mixto' ? 'mixta cover + productos' : 'mixta'
        return `Compra ${etiqueta} CHK-${transaccionCheckoutId ?? 'NEW'}/TXN-${transaccionProductoId ?? 'NEW'} - ${eventoTitulo}`
      }
      if (tipo === 'productos') return `Pedido productos TXN-${transaccionProductoId ?? 'CHK'} - ${eventoTitulo}`
      if (tipo === 'cover') return `Compra cover CHK-${transaccionCheckoutId ?? 'NEW'} - ${eventoTitulo}`
      return `Compra boletas CHK-${transaccionCheckoutId ?? 'NEW'} - ${eventoTitulo}`
    })()

    const paymentDescription = (() => {
      if (tipoEsMixto(tipo)) {
        const etiqueta = tipo === 'cover_mixto' ? 'cover + productos' : 'boletas + productos'
        return `Pago combinado ${etiqueta} (CHK ${transaccionCheckoutId ?? 'NEW'})`
      }
      if (tipo === 'productos') {
        return `Pago pedido productos (TXN ${transaccionProductoId ?? 'CHK'})`
      }
      if (tipo === 'cover') {
        return `Pago cover (CHK ${transaccionCheckoutId ?? 'NEW'})`
      }
      return `Pago boletas (CHK ${transaccionCheckoutId ?? 'NEW'})`
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

    // Expiración del link de checkout para evitar pendientes eternos.
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
            compra_id: null,
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
              transaccion_producto_id: transaccionProductoId,
            },
            expires_at: expiresAt,
            flow_version: 'v1-unificado',
          })
          .select('id')
          .single()

        if (checkoutError) {
          throw new Error(`No se pudo crear transaccion_checkout: ${checkoutError.message}`)
        }
        transaccionCheckoutId = Number(checkout?.id)
      }
    }

    console.log('Pago creado:', { tipo, transaccionCheckoutId, transaccionProductoId, reference, paymentLinkId, clienteEmail })

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
