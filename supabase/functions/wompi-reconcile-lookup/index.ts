import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const WOMPI_RECONCILE_LOOKUP_VERSION = '1.2.0-email-context'
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

function resolvePendingTtlMinutes(): number {
  const raw = Number(Deno.env.get('WOMPI_PRODUCT_PENDING_TTL_MINUTES') || 30)
  if (!Number.isFinite(raw)) return 30
  return Math.min(1440, Math.max(5, Math.floor(raw)))
}

function mergeRowsById<T extends { id: unknown; fecha_creacion?: unknown }>(
  ...lists: Array<Array<T> | null | undefined>
): T[] {
  const byId = new Map<number, T>()
  for (const list of lists) {
    for (const row of list ?? []) {
      byId.set(Number(row.id), row)
    }
  }
  return Array.from(byId.values()).sort((a, b) =>
    String(b.fecha_creacion ?? '').localeCompare(String(a.fecha_creacion ?? ''))
  )
}

function classifyOrphanTipo(row: Record<string, unknown>): 'aprobada_sin_compra' | 'pendiente_vencida' {
  if (isDbWompiApproved(row.estado, row.wompi_status)) {
    return 'aprobada_sin_compra'
  }
  return 'pendiente_vencida'
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
    console.error('wompi-reconcile-lookup auth.getUser:', callerAuthError?.message)
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

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function extractEmailFromCheckoutPayload(checkout: Record<string, unknown> | null): string {
  if (!checkout?.request_payload || typeof checkout.request_payload !== 'object') {
    return ''
  }
  const payload = checkout.request_payload as Record<string, unknown>
  const requestBody = payload.request_body
  if (requestBody && typeof requestBody === 'object') {
    const fromBody = normalizeEmail((requestBody as Record<string, unknown>).customer_email)
    if (fromBody) return fromBody
  }
  return normalizeEmail(payload.customer_email)
}

function buildEmailContext(params: {
  checkout: Record<string, unknown> | null
  wompiTransaction: Record<string, unknown> | null
}): Record<string, unknown> {
  const cliente = params.checkout?.cliente as { email?: string | null } | null | undefined
  const emailCuenta = normalizeEmail(cliente?.email)
  const emailWompi = normalizeEmail(params.wompiTransaction?.customer_email)
  const emailAlCrearCheckout = extractEmailFromCheckoutPayload(params.checkout)

  const emailsCoinciden = emailCuenta && emailWompi ? emailCuenta === emailWompi : null
  const materializado = params.checkout?.materializado === true

  let mensajeSoporte: string | null = null
  if (emailCuenta && emailWompi && emailsCoinciden === false) {
    if (materializado && params.checkout?.compra_id) {
      mensajeSoporte =
        `El pago sí está materializado (compra #${params.checkout.compra_id}), pero el comprobante Wompi muestra ${emailWompi} y las boletas están en la cuenta Eventum ${emailCuenta}. Indica al cliente: «Inicia sesión en Eventum con ${emailCuenta} y entra a Mis compras — no uses el correo del recibo de Wompi».`
    } else {
      mensajeSoporte =
        `Correo del comprobante Wompi (${emailWompi}) distinto al de la cuenta Eventum (${emailCuenta}). Las boletas quedarán en la cuenta con la que inició sesión al comprar.`
    }
  } else if (emailCuenta && materializado) {
    mensajeSoporte = `Boletas en la cuenta Eventum ${emailCuenta} → Mis compras.`
  }

  return {
    email_cuenta_eventum: emailCuenta || null,
    email_wompi_comprobante: emailWompi || null,
    email_al_crear_checkout: emailAlCrearCheckout || null,
    emails_coinciden: emailsCoinciden,
    mensaje_soporte: mensajeSoporte,
  }
}

async function searchCheckoutsByEmail(
  supabaseClient: ReturnType<typeof createClient>,
  emailInput: string,
): Promise<{
  email: string
  usuario: Record<string, unknown> | null
  matches: Array<{ match_type: string; checkout: Record<string, unknown> }>
}> {
  const email = normalizeEmail(emailInput)
  if (!email || !email.includes('@')) {
    throw new Error('Indica un correo válido')
  }

  const matches: Array<{ match_type: string; checkout: Record<string, unknown> }> = []
  const seenIds = new Set<number>()

  const pushMatch = (matchType: string, row: Record<string, unknown>) => {
    const id = Number(row.id)
    if (!Number.isFinite(id) || id <= 0 || seenIds.has(id)) return
    seenIds.add(id)
    matches.push({ match_type: matchType, checkout: row })
  }

  const { data: usuario } = await supabaseClient
    .from('usuarios')
    .select('id, nombre, apellido, email, documento_identidad, activo')
    .ilike('email', email)
    .maybeSingle()

  if (usuario?.id) {
    const { data: byCliente } = await supabaseClient
      .from('transacciones_checkout')
      .select(CHECKOUT_SELECT)
      .eq('cliente_id', Number(usuario.id))
      .order('fecha_creacion', { ascending: false })
      .limit(25)
    for (const row of byCliente ?? []) {
      pushMatch('cuenta_eventum', row as Record<string, unknown>)
    }
  }

  const { data: byWompiPayload } = await supabaseClient
    .from('transacciones_checkout')
    .select(CHECKOUT_SELECT)
    .eq('response_payload->>customer_email', email)
    .order('fecha_creacion', { ascending: false })
    .limit(25)

  for (const row of byWompiPayload ?? []) {
    pushMatch('comprobante_wompi', row as Record<string, unknown>)
  }

  return {
    email,
    usuario: usuario as Record<string, unknown> | null,
    matches,
  }
}

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
        mensaje: 'Wompi APPROVED pero checkout sigue pendiente en Eventum — usar Sincronizar.',
      })
    }

    if (dbEstado === 'pendiente' && checkoutNeedsMaterialization({
      compra_id: checkout.compra_id as number | null,
      compra_producto_id: checkout.compra_producto_id as number | null,
      compra_cover_id: checkout.compra_cover_id as number | null,
      materializado: checkout.materializado as boolean | null,
    })) {
      items.push({
        nivel: 'warning',
        codigo: 'PENDING_UNMATERIALIZED',
        mensaje: 'Checkout pendiente sin compra — puede haber pago APPROVED en Wompi; consultar o sincronizar.',
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

    const emailCtx = buildEmailContext({ checkout, wompiTransaction: wompiTransaction })
    if (emailCtx.emails_coinciden === false) {
      items.unshift({
        nivel: 'info',
        codigo: 'EMAIL_WOMPI_VS_CUENTA',
        mensaje: String(
          emailCtx.mensaje_soporte ||
            'El correo del comprobante Wompi no coincide con la cuenta Eventum donde están las boletas.',
        ),
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
      .from('boletas_compradas')
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
      action?: 'lookup' | 'list_orphans' | 'search_by_email'
      reference?: string
      wompi_transaction_id?: string
      transaccion_checkout_id?: number
      compra_id?: number
      compra_producto_id?: number
      transaccion_producto_id?: number
      wompi_cuenta_id?: number
      email?: string
    }

    const action = body.action === 'list_orphans'
      ? 'list_orphans'
      : body.action === 'search_by_email'
        ? 'search_by_email'
        : 'lookup'

    if (action === 'search_by_email') {
      const email = body.email?.trim() || ''
      const searchResult = await searchCheckoutsByEmail(supabaseClient, email)
      return jsonResponse({
        success: true,
        ...searchResult,
        total: searchResult.matches.length,
        hint:
          searchResult.matches.length === 0
            ? 'No hay checkouts con ese correo. Prueba referencia/transacción del comprobante Wompi.'
            : 'Si el cliente dio el correo del recibo Wompi, prioriza filas «comprobante_wompi» y revisa la cuenta Eventum en cada fila.',
      })
    }

    if (action === 'list_orphans') {
      const ttlMinutes = resolvePendingTtlMinutes()
      const cutoffIso = new Date(Date.now() - ttlMinutes * 60_000).toISOString()

      const { data: approvedOrphans, error: approvedError } = await supabaseClient
        .from('transacciones_checkout')
        .select(CHECKOUT_SELECT)
        .or('estado.eq.aprobada,wompi_status.eq.APPROVED')
        .or('materializado.eq.false,materializado.is.null')
        .is('compra_id', null)
        .is('compra_producto_id', null)
        .is('compra_cover_id', null)
        .order('fecha_creacion', { ascending: false })
        .limit(50)

      if (approvedError) {
        throw approvedError
      }

      const { data: pendingOrphans, error: pendingError } = await supabaseClient
        .from('transacciones_checkout')
        .select(CHECKOUT_SELECT)
        .eq('estado', 'pendiente')
        .or('materializado.eq.false,materializado.is.null')
        .is('compra_id', null)
        .is('compra_producto_id', null)
        .is('compra_cover_id', null)
        .not('wompi_reference', 'is', null)
        .lte('fecha_creacion', cutoffIso)
        .order('fecha_creacion', { ascending: false })
        .limit(50)

      if (pendingError) {
        throw pendingError
      }

      const merged = mergeRowsById(approvedOrphans, pendingOrphans).slice(0, 50)

      const rows = merged.map((row) => ({
        ...row,
        orphan_tipo: classifyOrphanTipo(row as Record<string, unknown>),
        diagnostico: buildDiagnostico({
          checkout: row as Record<string, unknown>,
          wompiTransaction: null,
          transaccionProducto: null,
        }),
        requiere_accion: true,
      }))

      return jsonResponse({
        success: true,
        orphans: rows,
        total: rows.length,
        ttl_minutes: ttlMinutes,
        cutoff: cutoffIso,
      })
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
      const emailSearch = body.email?.trim()
      if (emailSearch) {
        const searchResult = await searchCheckoutsByEmail(supabaseClient, emailSearch)
        if (searchResult.matches.length === 1) {
          checkout = searchResult.matches[0].checkout
          transaccionCheckoutId = Number(checkout.id)
        } else {
          return jsonResponse({
            success: true,
            lookup_mode: 'email_multiple',
            ...searchResult,
            total: searchResult.matches.length,
          })
        }
      } else {
        return jsonResponse({ success: false, error: 'Indica reference, wompi_transaction_id, email, transaccion_checkout_id, compra_id o transaccion_producto_id' }, 400)
      }
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
      [
        'NEEDS_MATERIALIZATION',
        'PRODUCTO_NEEDS_MATERIALIZATION',
        'WOMPI_APPROVED_CHECKOUT_PENDING',
        'PENDING_UNMATERIALIZED',
        'CHECKOUT_NOT_FOUND',
      ].includes(d.codigo)
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

    const emailContext = buildEmailContext({ checkout, wompiTransaction })

    return jsonResponse({
      success: true,
      lookup_source: wompiLookupSource,
      wompi_environment: credentials.environment,
      wompi_cuenta_id: credentials.wompiCuentaId,
      requiere_accion: requiereAccion,
      diagnostico,
      email_context: emailContext,
      wompi: wompiSummary,
      wompi_raw: wompiTransaction,
      checkout,
      transaccion_producto: transaccionProducto,
      compras,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === 'UNAUTHORIZED') {
      return jsonResponse({
        success: false,
        error: 'Sesión inválida o expirada. Cierra sesión e inicia de nuevo como administrador.',
      }, 401)
    }
    if (message === 'FORBIDDEN') {
      return jsonResponse({ success: false, error: 'Solo administradores pueden consultar reconciliación Wompi' }, 403)
    }
    console.error('wompi-reconcile-lookup error:', message)
    return jsonResponse({ success: false, error: message }, 400)
  }
})
