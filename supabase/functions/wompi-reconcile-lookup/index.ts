import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const WOMPI_RECONCILE_LOOKUP_VERSION = '1.0.0-cross-ref'
const ADMIN_TIPO_USUARIO_ID = 3

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ENV_VAR_NAME_REGEX = /^[A-Z][A-Z0-9_]*$/

type DiagnosticoItem = {
  nivel: 'ok' | 'warning' | 'error' | 'info'
  codigo: string
  mensaje: string
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify({ version: WOMPI_RECONCILE_LOOKUP_VERSION, ...body }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
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
    return { transaccionProductoId: null, transaccionCheckoutId: Number(checkoutMatch[1]) }
  }

  const mixMatch = ref.match(/^EVENTUM-MIX-(\d+)-TXN-(\d+)-/i)
  if (mixMatch) {
    return { transaccionProductoId: Number(mixMatch[2]), transaccionCheckoutId: Number(mixMatch[1]) }
  }

  const prodTxnMatch = ref.match(/^EVENTUM-PROD-TXN-(\d+)-/i)
  if (prodTxnMatch) {
    return { transaccionProductoId: Number(prodTxnMatch[1]), transaccionCheckoutId: null }
  }

  return { transaccionProductoId: null, transaccionCheckoutId: null }
}

function checkoutNeedsMaterialization(row: {
  compra_id?: number | null
  compra_producto_id?: number | null
  compra_cover_id?: number | null
  materializado?: boolean | null
}): boolean {
  if (row.materializado === true) return false
  return (
    Number(row.compra_id ?? 0) <= 0 &&
    Number(row.compra_producto_id ?? 0) <= 0 &&
    Number(row.compra_cover_id ?? 0) <= 0
  )
}

function isDbWompiApproved(estado: unknown, wompiStatus: unknown): boolean {
  return (
    String(estado || '').toLowerCase() === 'aprobada' ||
    String(wompiStatus || '').toUpperCase() === 'APPROVED'
  )
}

async function assertAdminCaller(
  adminClient: ReturnType<typeof createClient>,
  req: Request,
): Promise<void> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    throw new Error('UNAUTHORIZED')
  }

  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!jwt) {
    throw new Error('UNAUTHORIZED')
  }

  const {
    data: { user: callerAuthUser },
    error: callerAuthError,
  } = await adminClient.auth.getUser(jwt)

  if (callerAuthError || !callerAuthUser) {
    throw new Error('UNAUTHORIZED')
  }

  const { data: caller, error: callerError } = await adminClient
    .from('usuarios')
    .select('id, tipo_usuario_id, activo')
    .eq('auth_user_id', callerAuthUser.id)
    .maybeSingle()

  if (callerError) {
    throw callerError
  }

  if (!caller || caller.tipo_usuario_id !== ADMIN_TIPO_USUARIO_ID || caller.activo !== true) {
    throw new Error('FORBIDDEN')
  }
}

async function resolveWompiCredentials(
  supabaseClient: ReturnType<typeof createClient>,
  eventoId: number | null,
  wompiCuentaIdHint: number | null,
): Promise<{ privateKey: string; environment: string; wompiCuentaId: number | null }> {
  let privateKey = (Deno.env.get('WOMPI_PRIVATE_KEY') || '').trim()
  let environment = (Deno.env.get('WOMPI_ENVIRONMENT') || 'sandbox').trim().toLowerCase()
  let wompiCuentaId = wompiCuentaIdHint

  if (!wompiCuentaId && eventoId) {
    const { data } = await supabaseClient
      .from('eventos')
      .select('wompi_cuenta_id')
      .eq('id', eventoId)
      .maybeSingle()
    wompiCuentaId = data?.wompi_cuenta_id ?? null
  }

  if (wompiCuentaId) {
    const { data: cuenta } = await supabaseClient
      .from('wompi_cuentas')
      .select('id, nombre, private_key_env, environment_env, activo')
      .eq('id', wompiCuentaId)
      .maybeSingle()

    if (cuenta?.activo) {
      const key = resolveSecretByEnvName(cuenta.private_key_env)
      if (key) privateKey = key
      const env = resolveSecretByEnvName(cuenta.environment_env ?? null)
      if (env) environment = env.toLowerCase()
    }
  }

  if (!privateKey) {
    throw new Error('Wompi Private Key no configurado')
  }

  return { privateKey, environment, wompiCuentaId }
}

async function fetchTransactionById(
  wompiBaseUrl: string,
  privateKey: string,
  wompiTransactionId: string,
): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${wompiBaseUrl}/transactions/${encodeURIComponent(wompiTransactionId)}`, {
    headers: { Authorization: `Bearer ${privateKey}` },
  })
  const data = await response.json()
  if (!response.ok) return null
  const transaction = data?.data as Record<string, unknown> | undefined
  if (!transaction?.status) return null
  return transaction
}

async function fetchTransactionByReference(
  wompiBaseUrl: string,
  privateKey: string,
  wompiReference: string,
): Promise<Record<string, unknown> | null> {
  const response = await fetch(
    `${wompiBaseUrl}/transactions?reference=${encodeURIComponent(wompiReference)}`,
    { headers: { Authorization: `Bearer ${privateKey}` } },
  )
  const data = await response.json()
  if (!response.ok) return null

  const rows = Array.isArray(data?.data) ? data.data : (data?.data ? [data.data] : [])
  if (!rows.length) return null
  const chosen =
    rows.find((row: Record<string, unknown>) =>
      ['APPROVED', 'DECLINED', 'VOIDED', 'ERROR'].includes(String(row.status || '').toUpperCase())
    ) || rows[rows.length - 1]
  return chosen as Record<string, unknown>
}

const CHECKOUT_SELECT = `
  id, tipo, cliente_id, evento_id, wompi_cuenta_id,
  compra_id, compra_producto_id, compra_cover_id,
  numero_intento, wompi_transaction_id, wompi_reference, wompi_status,
  estado, es_activa, materializado, total, moneda,
  fecha_creacion, fecha_confirmacion, fecha_cancelacion,
  request_payload, metadata,
  cliente:usuarios(id, nombre, apellido, email, documento_identidad),
  evento:eventos(id, titulo, wompi_cuenta_id)
`

function buildDiagnostico(params: {
  checkout: Record<string, unknown> | null
  wompiTransaction: Record<string, unknown> | null
  transaccionProducto: Record<string, unknown> | null
}): DiagnosticoItem[] {
  const items: DiagnosticoItem[] = []
  const { checkout, wompiTransaction, transaccionProducto } = params

  const wompiStatus = String(wompiTransaction?.status || '').toUpperCase()
  const dbEstado = checkout ? String(checkout.estado || '').toLowerCase() : ''
  const dbWompiStatus = checkout ? String(checkout.wompi_status || '').toUpperCase() : ''

  if (!checkout && !transaccionProducto && wompiTransaction) {
    items.push({
      nivel: 'error',
      codigo: 'CHECKOUT_NOT_FOUND',
      mensaje: 'Hay transacción en Wompi pero no se encontró checkout ni transacción producto en Eventum.',
    })
  }

  if ((checkout || transaccionProducto) && !wompiTransaction) {
    items.push({
      nivel: 'warning',
      codigo: 'WOMPI_NOT_FOUND',
      mensaje: 'Registro en Eventum sin transacción correspondiente en Wompi (aún pendiente o reference distinta).',
    })
  }

  if (checkout) {
    const payload = checkout.request_payload
    if (!payload || (typeof payload === 'object' && Object.keys(payload as object).length === 0)) {
      items.push({
        nivel: 'error',
        codigo: 'MISSING_PAYLOAD',
        mensaje: 'El checkout no tiene request_payload — no se puede materializar automáticamente.',
      })
    }

    if (checkoutNeedsMaterialization({
      compra_id: checkout.compra_id as number | null,
      compra_producto_id: checkout.compra_producto_id as number | null,
      compra_cover_id: checkout.compra_cover_id as number | null,
      materializado: checkout.materializado as boolean | null,
    })) {
      if (wompiStatus === 'APPROVED' || isDbWompiApproved(checkout.estado, checkout.wompi_status)) {
        items.push({
          nivel: 'warning',
          codigo: 'NEEDS_MATERIALIZATION',
          mensaje: 'Pago aprobado pero sin compra materializada — usar Sincronizar.',
        })
      }
    }

    if (wompiStatus && dbWompiStatus && wompiStatus !== dbWompiStatus) {
      items.push({
        nivel: 'warning',
        codigo: 'STATUS_MISMATCH',
        mensaje: `Estado Wompi distinto: API=${wompiStatus}, BD=${dbWompiStatus || '—'}.`,
      })
    }

    if (wompiStatus === 'APPROVED' && dbEstado === 'pendiente') {
      items.push({
        nivel: 'warning',
        codigo: 'WOMPI_APPROVED_CHECKOUT_PENDING',
        mensaje: 'Wompi APPROVED pero checkout sigue pendiente en Eventum.',
      })
    }

    if (
      wompiStatus === 'APPROVED' &&
      checkout.materializado === true &&
      (checkout.compra_id || checkout.compra_producto_id || checkout.compra_cover_id)
    ) {
      items.push({
        nivel: 'ok',
        codigo: 'ALIGNED',
        mensaje: 'Pago y compra alineados correctamente.',
      })
    }
  }

  if (transaccionProducto && !checkout) {
    const compraProductoId = transaccionProducto.compra_producto_id
    if (!compraProductoId && (wompiStatus === 'APPROVED' || isDbWompiApproved(transaccionProducto.estado, transaccionProducto.wompi_status))) {
      items.push({
        nivel: 'warning',
        codigo: 'PRODUCTO_NEEDS_MATERIALIZATION',
        mensaje: 'Transacción producto aprobada sin compra_producto_id — usar Sincronizar.',
      })
    }
  }

  if (items.length === 0) {
    items.push({
      nivel: 'info',
      codigo: 'NO_ISSUES_DETECTED',
      mensaje: 'No se detectaron discrepancias evidentes con los datos disponibles.',
    })
  }

  return items
}

async function loadCheckoutById(
  supabaseClient: ReturnType<typeof createClient>,
  id: number,
): Promise<Record<string, unknown> | null> {
  const { data } = await supabaseClient
    .from('transacciones_checkout')
    .select(CHECKOUT_SELECT)
    .eq('id', id)
    .maybeSingle()
  return data as Record<string, unknown> | null
}

async function loadCompraResumen(
  supabaseClient: ReturnType<typeof createClient>,
  checkout: Record<string, unknown> | null,
): Promise<Record<string, unknown>> {
  const resumen: Record<string, unknown> = {}

  const compraId = checkout?.compra_id ? Number(checkout.compra_id) : null
  if (compraId) {
    const { data } = await supabaseClient
      .from('compras')
      .select('id, estado_compra, estado_pago, total, moneda, fecha_creacion')
      .eq('id', compraId)
      .maybeSingle()
    const { count } = await supabaseClient
      .from('boletas')
      .select('id', { count: 'exact', head: true })
      .eq('compra_id', compraId)
    resumen.compra_boletas = { ...(data || {}), boletas_count: count ?? 0 }
  }

  const compraProductoId = checkout?.compra_producto_id ? Number(checkout.compra_producto_id) : null
  if (compraProductoId) {
    const { data } = await supabaseClient
      .from('compras_productos')
      .select('id, estado_compra, estado_pago, total, moneda, fecha_creacion')
      .eq('id', compraProductoId)
      .maybeSingle()
    resumen.compra_productos = data
  }

  const compraCoverId = checkout?.compra_cover_id ? Number(checkout.compra_cover_id) : null
  if (compraCoverId) {
    const { data } = await supabaseClient
      .from('compras_cover')
      .select('id, estado_compra, estado_pago, total, moneda, fecha_creacion')
      .eq('id', compraCoverId)
      .maybeSingle()
    const { count } = await supabaseClient
      .from('boletas_cover')
      .select('id', { count: 'exact', head: true })
      .eq('compra_cover_id', compraCoverId)
    resumen.compra_cover = { ...(data || {}), boletas_cover_count: count ?? 0 }
  }

  return resumen
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase no configurado')
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)
    await assertAdminCaller(supabaseClient, req)

    const body = await req.json() as {
      action?: 'lookup' | 'list_orphans'
      reference?: string
      wompi_transaction_id?: string
      transaccion_checkout_id?: number
      compra_id?: number
      compra_producto_id?: number
      transaccion_producto_id?: number
      wompi_cuenta_id?: number
    }

    const action = body.action === 'list_orphans' ? 'list_orphans' : 'lookup'

    if (action === 'list_orphans') {
      const { data: orphans, error } = await supabaseClient
        .from('transacciones_checkout')
        .select(CHECKOUT_SELECT)
        .or('estado.eq.aprobada,wompi_status.eq.APPROVED')
        .or('materializado.eq.false,materializado.is.null')
        .is('compra_id', null)
        .is('compra_producto_id', null)
        .is('compra_cover_id', null)
        .order('fecha_creacion', { ascending: false })
        .limit(50)

      if (error) {
        throw error
      }

      const rows = (orphans || []).map((row) => ({
        ...row,
        diagnostico: buildDiagnostico({ checkout: row as Record<string, unknown>, wompiTransaction: null, transaccionProducto: null }),
        requiere_accion: true,
      }))

      return jsonResponse({ success: true, orphans: rows, total: rows.length })
    }

    const reference = body.reference?.trim() || null
    const wompiTransactionIdInput = body.wompi_transaction_id?.trim() || null
    let transaccionCheckoutId = body.transaccion_checkout_id ? Number(body.transaccion_checkout_id) : null
    let transaccionProductoId = body.transaccion_producto_id ? Number(body.transaccion_producto_id) : null
    const wompiCuentaIdHint = body.wompi_cuenta_id ? Number(body.wompi_cuenta_id) : null

    let checkout: Record<string, unknown> | null = null
    let transaccionProducto: Record<string, unknown> | null = null

    if (transaccionCheckoutId) {
      checkout = await loadCheckoutById(supabaseClient, transaccionCheckoutId)
    }

    if (!checkout && body.compra_id) {
      const { data } = await supabaseClient
        .from('transacciones_checkout')
        .select(CHECKOUT_SELECT)
        .eq('compra_id', Number(body.compra_id))
        .order('fecha_creacion', { ascending: false })
        .limit(1)
        .maybeSingle()
      checkout = data as Record<string, unknown> | null
    }

    if (!checkout && body.compra_producto_id) {
      const { data } = await supabaseClient
        .from('transacciones_checkout')
        .select(CHECKOUT_SELECT)
        .eq('compra_producto_id', Number(body.compra_producto_id))
        .order('fecha_creacion', { ascending: false })
        .limit(1)
        .maybeSingle()
      checkout = data as Record<string, unknown> | null
    }

    if (transaccionProductoId) {
      const { data } = await supabaseClient
        .from('transacciones_producto')
        .select('id, evento_id, wompi_cuenta_id, compra_producto_id, wompi_transaction_id, wompi_reference, estado, wompi_status, es_activa, fecha_creacion')
        .eq('id', transaccionProductoId)
        .maybeSingle()
      transaccionProducto = data as Record<string, unknown> | null
    }

    if (reference) {
      const parsed = parseReference(reference)
      if (!checkout && parsed.transaccionCheckoutId) {
        checkout = await loadCheckoutById(supabaseClient, parsed.transaccionCheckoutId)
        transaccionCheckoutId = parsed.transaccionCheckoutId
      }
      if (!transaccionProducto && parsed.transaccionProductoId) {
        const { data } = await supabaseClient
          .from('transacciones_producto')
          .select('id, evento_id, wompi_cuenta_id, compra_producto_id, wompi_transaction_id, wompi_reference, estado, wompi_status, es_activa, fecha_creacion')
          .eq('id', parsed.transaccionProductoId)
          .maybeSingle()
        transaccionProducto = data as Record<string, unknown> | null
        transaccionProductoId = parsed.transaccionProductoId
      }
      if (!checkout) {
        const { data } = await supabaseClient
          .from('transacciones_checkout')
          .select(CHECKOUT_SELECT)
          .eq('wompi_reference', reference)
          .maybeSingle()
        checkout = data as Record<string, unknown> | null
      }
    }

    if (wompiTransactionIdInput && !checkout) {
      const { data } = await supabaseClient
        .from('transacciones_checkout')
        .select(CHECKOUT_SELECT)
        .eq('wompi_transaction_id', wompiTransactionIdInput)
        .order('fecha_creacion', { ascending: false })
        .limit(1)
        .maybeSingle()
      checkout = data as Record<string, unknown> | null
    }

    if (!checkout && !transaccionProducto && !reference && !wompiTransactionIdInput && !transaccionCheckoutId) {
      return jsonResponse({ success: false, error: 'Indica reference, wompi_transaction_id, transaccion_checkout_id, compra_id o transaccion_producto_id' }, 400)
    }

    const eventoId = checkout?.evento_id
      ? Number(checkout.evento_id)
      : (transaccionProducto?.evento_id ? Number(transaccionProducto.evento_id) : null)

    const wompiCuentaFromRow = checkout?.wompi_cuenta_id
      ? Number(checkout.wompi_cuenta_id)
      : (transaccionProducto?.wompi_cuenta_id ? Number(transaccionProducto.wompi_cuenta_id) : null)

    const credentials = await resolveWompiCredentials(
      supabaseClient,
      eventoId,
      wompiCuentaIdHint || wompiCuentaFromRow,
    )

    const wompiBaseUrl = credentials.environment === 'production'
      ? 'https://production.wompi.co/v1'
      : 'https://sandbox.wompi.co/v1'

    const wompiReference =
      reference ||
      (checkout?.wompi_reference ? String(checkout.wompi_reference) : null) ||
      (transaccionProducto?.wompi_reference ? String(transaccionProducto.wompi_reference) : null)

    const wompiTransactionId =
      wompiTransactionIdInput ||
      (checkout?.wompi_transaction_id ? String(checkout.wompi_transaction_id) : null) ||
      (transaccionProducto?.wompi_transaction_id ? String(transaccionProducto.wompi_transaction_id) : null)

    let wompiTransaction: Record<string, unknown> | null = null
    let wompiLookupSource: 'transaction_id' | 'reference' | null = null

    if (wompiTransactionId) {
      wompiTransaction = await fetchTransactionById(wompiBaseUrl, credentials.privateKey, wompiTransactionId)
      if (wompiTransaction) wompiLookupSource = 'transaction_id'
    }

    if (!wompiTransaction && wompiReference) {
      wompiTransaction = await fetchTransactionByReference(wompiBaseUrl, credentials.privateKey, wompiReference)
      if (wompiTransaction) wompiLookupSource = 'reference'
    }

    if (!checkout && wompiTransaction) {
      const refFromWompi = wompiTransaction.reference ? String(wompiTransaction.reference) : null
      if (refFromWompi) {
        const parsed = parseReference(refFromWompi)
        if (parsed.transaccionCheckoutId) {
          checkout = await loadCheckoutById(supabaseClient, parsed.transaccionCheckoutId)
        }
        if (!checkout) {
          const { data } = await supabaseClient
            .from('transacciones_checkout')
            .select(CHECKOUT_SELECT)
            .eq('wompi_reference', refFromWompi)
            .maybeSingle()
          checkout = data as Record<string, unknown> | null
        }
      }
    }

    const compras = await loadCompraResumen(supabaseClient, checkout)
    const diagnostico = buildDiagnostico({ checkout, wompiTransaction, transaccionProducto })
    const requiereAccion = diagnostico.some((d) =>
      ['NEEDS_MATERIALIZATION', 'PRODUCTO_NEEDS_MATERIALIZATION', 'WOMPI_APPROVED_CHECKOUT_PENDING', 'CHECKOUT_NOT_FOUND'].includes(d.codigo)
    )

    const wompiSummary = wompiTransaction
      ? {
          id: wompiTransaction.id,
          status: wompiTransaction.status,
          reference: wompiTransaction.reference,
          amount_in_cents: wompiTransaction.amount_in_cents,
          currency: wompiTransaction.currency,
          payment_method_type: wompiTransaction.payment_method_type,
          customer_email: (wompiTransaction.customer_email as string | undefined) ?? null,
          created_at: wompiTransaction.created_at,
          finalized_at: wompiTransaction.finalized_at,
        }
      : null

    return jsonResponse({
      success: true,
      lookup_source: wompiLookupSource,
      wompi_environment: credentials.environment,
      wompi_cuenta_id: credentials.wompiCuentaId,
      requiere_accion: requiereAccion,
      diagnostico,
      wompi: wompiSummary,
      wompi_raw: wompiTransaction,
      checkout,
      transaccion_producto: transaccionProducto,
      compras,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === 'UNAUTHORIZED') {
      return jsonResponse({ success: false, error: 'No autorizado' }, 401)
    }
    if (message === 'FORBIDDEN') {
      return jsonResponse({ success: false, error: 'Solo administradores pueden consultar reconciliación Wompi' }, 403)
    }
    console.error('wompi-reconcile-lookup error:', message)
    return jsonResponse({ success: false, error: message }, 400)
  }
})
