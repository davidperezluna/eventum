import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, signature',
}

const ENV_VAR_NAME_REGEX = /^[A-Z][A-Z0-9_]*$/

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

type TipoPago = 'boletas' | 'productos' | 'mixto'

function inferirTipoPago(body: Record<string, unknown>): TipoPago {
  const tipo = String(body.tipo || '').trim().toLowerCase()
  if (tipo === 'productos' || tipo === 'mixto' || tipo === 'boletas') {
    return tipo as TipoPago
  }
  const compraId = body.compra_id
  const compraProductoId = body.compra_producto_id
  if (compraId && compraProductoId) return 'mixto'
  if (compraProductoId) return 'productos'
  return 'boletas'
}

function buildReference(tipo: TipoPago, compraId: number | null, compraProductoId: number | null): string {
  const ts = Date.now()
  if (tipo === 'mixto' && compraId && compraProductoId) {
    return `EVENTUM-MIX-${compraId}-${compraProductoId}-${ts}`
  }
  if (tipo === 'productos' && compraProductoId) {
    return `EVENTUM-PROD-${compraProductoId}-${ts}`
  }
  if (compraId) {
    return `EVENTUM-${compraId}-${ts}`
  }
  throw new Error('No se pudo generar referencia Wompi')
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
  const requested =
    typeof requestedRedirectUrl === 'string' && requestedRedirectUrl.trim().length > 0
      ? requestedRedirectUrl.trim()
      : fallbackRedirectUrl
  const publicAppUrl = (Deno.env.get('PUBLIC_APP_URL') || '').trim().replace(/\/+$/, '')
  const isLocalRedirect = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(requested)
  return isLocalRedirect && publicAppUrl ? fallbackRedirectUrl : requested
}

async function ensureTransaccionProducto(  supabaseClient: ReturnType<typeof createClient>,
  compraProductoId: number,
  monto: number,
  wompiCuentaId: number | null,
): Promise<number> {
  const { data: existing } = await supabaseClient
    .from('transacciones_producto')
    .select('id')
    .eq('compra_producto_id', compraProductoId)
    .eq('es_activa', true)
    .order('fecha_creacion', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    return existing.id
  }

  const { data: created, error } = await supabaseClient
    .from('transacciones_producto')
    .insert({
      compra_producto_id: compraProductoId,
      wompi_cuenta_id: wompiCuentaId,
      numero_transaccion: `WPROD-${compraProductoId}-${Date.now()}`,
      monto,
      monto_centavos: Math.round(monto * 100),
      moneda: 'COP',
      estado: 'pendiente',
      es_activa: true,
    })
    .select('id')
    .single()

  if (error || !created) {
    throw new Error(`No se pudo crear transacción de producto: ${error?.message || 'desconocido'}`)
  }

  return created.id
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('=== Iniciando wompi-payment ===')

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
    const compraId = requestBody.compra_id ? Number(requestBody.compra_id) : null
    const compraProductoId = requestBody.compra_producto_id ? Number(requestBody.compra_producto_id) : null
    const amountInCents = requestBody.amount_in_cents ? Number(requestBody.amount_in_cents) : null
    const redirectUrl = typeof requestBody.redirect_url === 'string' ? requestBody.redirect_url : undefined
    const customerEmail = typeof requestBody.customer_email === 'string' ? requestBody.customer_email : undefined

    if (tipo === 'boletas' && !compraId) {
      throw new Error('compra_id es requerido para pagos de boletas')
    }
    if (tipo === 'productos' && !compraProductoId) {
      throw new Error('compra_producto_id es requerido para pagos de productos')
    }
    if (tipo === 'mixto' && (!compraId || !compraProductoId)) {
      throw new Error('compra_id y compra_producto_id son requeridos para pagos mixtos')
    }

    let compra: Record<string, unknown> | null = null
    let compraProducto: Record<string, unknown> | null = null
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

    if (compraProductoId) {
      const { data, error } = await supabaseClient
        .from('compras_productos')
        .select('*, eventos!inner(id, titulo, wompi_cuenta_id)')
        .eq('id', compraProductoId)
        .single()

      if (error || !data) {
        throw new Error('Error al obtener la compra de productos: ' + (error?.message || 'no encontrada'))
      }
      compraProducto = data
      const evento = toObject<{ id?: number; titulo?: string; wompi_cuenta_id?: number | null }>(data.eventos)
      eventoTitulo = evento?.titulo || eventoTitulo
      const productoEventoId = evento?.id ?? Number(data.evento_id)
      if (eventoId && productoEventoId !== eventoId) {
        throw new Error('Las compras mixtas deben pertenecer al mismo evento')
      }
      eventoId = eventoId ?? productoEventoId
      const productoClienteId = Number(data.cliente_id)
      if (clienteId && productoClienteId !== clienteId) {
        throw new Error('Las compras mixtas deben pertenecer al mismo cliente')
      }
      clienteId = clienteId ?? productoClienteId
      wompiCuentaHint = wompiCuentaHint ?? (data.wompi_cuenta_id as number | null) ?? evento?.wompi_cuenta_id ?? null
      totalEsperado += Number(data.total || 0)
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

    const reference = buildReference(tipo, compraId, compraProductoId)

    const query = new URLSearchParams()
    if (compraId) query.set('compra_id', String(compraId))
    if (compraProductoId) query.set('compra_producto_id', String(compraProductoId))
    const fallbackRedirectUrl = publicAppUrl
      ? `${publicAppUrl}/pago-resultado?${query.toString()}`
      : `http://localhost:4200/pago-resultado?${query.toString()}`
    const redirectUrlFinal = resolveRedirectUrl(redirectUrl, fallbackRedirectUrl)

    const paymentName = (() => {
      if (tipo === 'mixto') return `Compra mixta ${compraId}/${compraProductoId} - ${eventoTitulo}`
      if (tipo === 'productos') return `Pedido productos ${compraProductoId} - ${eventoTitulo}`
      return `Compra ${compraId} - ${eventoTitulo}`
    })()

    const paymentDescription = (() => {
      if (tipo === 'mixto') {
        return `Pago combinado boletas #${compraId} + productos #${compraProductoId}`
      }
      if (tipo === 'productos') {
        return `Pago pedido productos #${compraProductoId}`
      }
      return `Pago para compra #${compraId}`
    })()

    const paymentLinkRequest = {
      name: paymentName,
      description: paymentDescription,
      single_use: true,
      collect_shipping: false,
      currency: 'COP',
      amount_in_cents: montoCentavos,
      redirect_url: redirectUrlFinal,
      reference,
    }

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

    if (compraProductoId && compraProducto) {
      const transaccionProductoId = await ensureTransaccionProducto(
        supabaseClient,
        compraProductoId,
        Number(compraProducto.total || 0),
        wompiCuentaId,
      )

      const { error: updateTransaccionError } = await supabaseClient
        .from('transacciones_producto')
        .update({
          wompi_cuenta_id: wompiCuentaId,
          wompi_transaction_id: paymentLinkId,
          wompi_reference: reference,
          wompi_status: wompiData.data?.status || 'PENDING',
          checkout_url: wompiData.data?.checkout_url,
          redirect_url: redirectUrlFinal,
          request_payload: paymentLinkRequest,
          response_payload: wompiData,
          fecha_actualizacion: new Date().toISOString(),
        })
        .eq('id', transaccionProductoId)

      if (updateTransaccionError) {
        console.error('Error actualizando transacción de producto:', updateTransaccionError)
      }

      const { error: updateCompraProductoError } = await supabaseClient
        .from('compras_productos')
        .update({ wompi_cuenta_id: wompiCuentaId })
        .eq('id', compraProductoId)

      if (updateCompraProductoError) {
        console.error('Error actualizando compra de productos:', updateCompraProductoError)
      }
    }

    console.log('Pago creado:', { tipo, compraId, compraProductoId, reference, paymentLinkId, clienteEmail })

    return new Response(
      JSON.stringify({
        success: true,
        tipo,
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
