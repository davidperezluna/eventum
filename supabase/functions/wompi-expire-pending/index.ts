import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/** Expira checkouts pendientes y reconcilia aprobados sin materializar. */
const WOMPI_EXPIRE_PENDING_VERSION = '2.6.0-approved-orphan-reconcile'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ENV_VAR_NAME_REGEX = /^[A-Z][A-Z0-9_]*$/

type WompiAccountCache = {
  privateKey: string
  environment: string
}

function isMissingTableError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null
  const message = String(e?.message || '').toLowerCase()
  return (
    e?.code === '42P01' ||
    e?.code === 'PGRST205' ||
    e?.code === 'PGRST204' ||
    (message.includes('relation') && message.includes('does not exist')) ||
    (message.includes('could not find') && message.includes('table')) ||
    (message.includes('schema cache') && message.includes('transacciones_'))
  )
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

function resolveSecretByEnvName(envVarName: string | null | undefined): string | null {
  const name = String(envVarName || '').trim()
  if (!name) return null
  if (!ENV_VAR_NAME_REGEX.test(name)) {
    throw new Error(`Nombre de variable inválido: "${name}"`)
  }
  const value = Deno.env.get(name)
  return value && value.trim().length > 0 ? value.trim() : null
}

function resolvePendingTtlMinutes(): number {
  const raw = Number(Deno.env.get('WOMPI_PRODUCT_PENDING_TTL_MINUTES') || 30)
  if (!Number.isFinite(raw)) return 30
  return Math.min(1440, Math.max(5, Math.floor(raw)))
}

function resolveBatchLimit(): number {
  const raw = Number(Deno.env.get('WOMPI_PRODUCT_EXPIRE_BATCH_LIMIT') || 200)
  if (!Number.isFinite(raw)) return 200
  return Math.min(1000, Math.max(10, Math.floor(raw)))
}

function mapFinalStatusToEstado(status: string): string {
  switch (status) {
    case 'DECLINED':
    case 'VOIDED':
    case 'ERROR':
      return 'rechazada'
    case 'APPROVED':
      return 'aprobada'
    default:
      return 'cancelada'
  }
}

async function resolveWompiCredentials(
  supabaseClient: ReturnType<typeof createClient>,
  eventoId: number | null,
  wompiCuentaIdHint: number | null,
  cache: Map<string, WompiAccountCache>,
): Promise<WompiAccountCache> {
  let wompiCuentaId = wompiCuentaIdHint
  let privateKey = (Deno.env.get('WOMPI_PRIVATE_KEY') || '').trim()
  let environment = (Deno.env.get('WOMPI_ENVIRONMENT') || 'sandbox').trim().toLowerCase()

  if (!wompiCuentaId && eventoId) {
    const { data: evento } = await supabaseClient
      .from('eventos')
      .select('wompi_cuenta_id')
      .eq('id', eventoId)
      .maybeSingle()
    wompiCuentaId = evento?.wompi_cuenta_id ?? null
  }

  if (wompiCuentaId) {
    const cacheKey = String(wompiCuentaId)
    const cached = cache.get(cacheKey)
    if (cached) return cached

    const { data: cuenta } = await supabaseClient
      .from('wompi_cuentas')
      .select('private_key_env, environment_env, activo')
      .eq('id', wompiCuentaId)
      .maybeSingle()

    if (cuenta?.activo) {
      const key = resolveSecretByEnvName(cuenta.private_key_env)
      if (key) privateKey = key
      const env = resolveSecretByEnvName(cuenta.environment_env ?? null)
      if (env) environment = env.toLowerCase()
    }

    if (!privateKey) {
      throw new Error(`Wompi Private Key no configurado para cuenta ${wompiCuentaId}`)
    }

    const resolved = { privateKey, environment }
    cache.set(cacheKey, resolved)
    return resolved
  }

  if (!privateKey) {
    throw new Error('Wompi Private Key no configurado')
  }
  return { privateKey, environment }
}

async function fetchTransactionById(
  wompiBaseUrl: string,
  privateKey: string,
  id: string,
): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${wompiBaseUrl}/transactions/${encodeURIComponent(id)}`, {
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
  reference: string,
): Promise<Record<string, unknown> | null> {
  const response = await fetch(
    `${wompiBaseUrl}/transactions?reference=${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${privateKey}` } },
  )
  const data = await response.json()
  if (!response.ok) return null
  const rows = Array.isArray(data?.data) ? data.data : (data?.data ? [data.data] : [])
  if (!rows.length) return null
  return (rows[rows.length - 1] || null) as Record<string, unknown> | null
}

function extractTransactionIds(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return []
  const result = new Set<string>()
  const queue: unknown[] = [payload]
  const visited = new Set<unknown>()

  while (queue.length > 0) {
    const current = queue.pop()
    if (!current || typeof current !== 'object' || visited.has(current)) continue
    visited.add(current)
    const obj = current as Record<string, unknown>
    if (typeof obj.id === 'string' && obj.id.trim()) {
      result.add(obj.id.trim())
    }
    if (typeof obj.transaction_id === 'string' && obj.transaction_id.trim()) {
      result.add(obj.transaction_id.trim())
    }
    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object') queue.push(value)
    }
  }

  return Array.from(result)
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

function productoTxnNeedsMaterialization(compraProductoId: number | null): boolean {
  return compraProductoId == null || compraProductoId <= 0
}

function isDbWompiApproved(estado: unknown, wompiStatus: unknown): boolean {
  return (
    String(estado || '').toLowerCase() === 'aprobada' ||
    String(wompiStatus || '').toUpperCase() === 'APPROVED'
  )
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
    String(a.fecha_creacion ?? '').localeCompare(String(b.fecha_creacion ?? ''))
  )
}

async function runSyntheticWebhook(
  supabaseUrl: string,
  supabaseServiceKey: string,
  environment: string,
  transaction: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const syntheticWebhook = {
    event: 'transaction.updated',
    data: { transaction },
    environment: environment === 'production' ? 'prod' : 'test',
    timestamp: Math.floor(Date.now() / 1000),
    sent_at: new Date().toISOString(),
    source: 'wompi-expire-pending',
  }

  const webhookResponse = await fetch(`${supabaseUrl}/functions/v1/wompi-webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseServiceKey}`,
      apikey: supabaseServiceKey,
    },
    body: JSON.stringify(syntheticWebhook),
  })

  const webhookResult = await webhookResponse.json()
  if (!webhookResponse.ok) {
    throw new Error(webhookResult?.error || `wompi-webhook respondió ${webhookResponse.status}`)
  }
  if (webhookResult?.success === false || webhookResult?.error) {
    throw new Error(String(webhookResult.error || 'wompi-webhook no procesó la materialización'))
  }
  return webhookResult as Record<string, unknown>
}

async function closeTransaccionProducto(
  supabaseClient: ReturnType<typeof createClient>,
  transaccionId: number,
  compraProductoId: number | null,
  estado: string,
  wompiStatus: string,
  motivo: string,
): Promise<void> {
  const now = new Date().toISOString()

  const { error: txnError } = await supabaseClient
    .from('transacciones_producto')
    .update({
      estado,
      wompi_status: wompiStatus,
      es_activa: false,
      fecha_actualizacion: now,
      webhook_payload: {
        source: 'wompi-expire-pending',
        closed_at: now,
        reason: motivo,
      },
    })
    .eq('id', transaccionId)

  if (txnError) {
    if (isMissingTableError(txnError)) return
    throw txnError
  }

  if (compraProductoId) {
    const { error: compraError } = await supabaseClient
      .from('compras_productos')
      .update({
        estado_pago: estado === 'aprobada' ? 'completado' : 'fallido',
        estado_compra: estado === 'aprobada' ? 'confirmada' : 'cancelada',
        fecha_cancelacion: estado === 'aprobada' ? null : now,
        motivo_cancelacion: estado === 'aprobada' ? null : motivo,
      })
      .eq('id', compraProductoId)

    if (compraError) throw compraError

    if (estado !== 'aprobada') {
      const { error: itemsError } = await supabaseClient
        .from('compras_productos_items')
        .update({ estado: 'cancelado' })
        .eq('compra_producto_id', compraProductoId)
        .eq('estado', 'pendiente')
      if (itemsError) throw itemsError
    }
  }
}

async function cancelarCompraCoverSiExiste(
  supabaseClient: ReturnType<typeof createClient>,
  compraCoverId: number,
  motivo: string,
): Promise<void> {
  const now = new Date().toISOString()
  const { error: compraError } = await supabaseClient
    .from('compras_cover')
    .update({
      estado_pago: 'fallido',
      estado_compra: 'cancelada',
      fecha_cancelacion: now,
      motivo_cancelacion: motivo,
    })
    .eq('id', compraCoverId)
    .neq('estado_compra', 'confirmada')

  if (compraError) throw compraError

  await supabaseClient
    .from('boletas_cover')
    .update({ estado: 'cancelada', fecha_actualizacion: now })
    .eq('compra_cover_id', compraCoverId)
    .in('estado', ['pendiente', 'activa'])
}

async function closeTransaccionCheckout(
  supabaseClient: ReturnType<typeof createClient>,
  checkoutId: number,
  estado: string,
  wompiStatus: string,
  motivo: string,
  compraId: number | null,
  compraProductoId: number | null,
  compraCoverId: number | null,
  transaccionProductoId: number | null,
): Promise<void> {
  const now = new Date().toISOString()
  const updateData: Record<string, unknown> = {
    estado,
    wompi_status: wompiStatus,
    es_activa: false,
    fecha_actualizacion: now,
    webhook_payload: {
      source: 'wompi-expire-pending',
      closed_at: now,
      reason: motivo,
    },
    fecha_confirmacion: estado === 'aprobada' ? now : null,
    fecha_cancelacion: estado === 'aprobada' ? null : now,
    motivo_cancelacion: estado === 'aprobada' ? null : motivo,
  }
  if (compraId) updateData.compra_id = compraId
  if (compraProductoId) updateData.compra_producto_id = compraProductoId
  if (compraCoverId) updateData.compra_cover_id = compraCoverId

  const { error } = await supabaseClient
    .from('transacciones_checkout')
    .update(updateData)
    .eq('id', checkoutId)
  if (error) throw error

  if (transaccionProductoId && estado !== 'aprobada') {
    await closeTransaccionProducto(
      supabaseClient,
      transaccionProductoId,
      compraProductoId,
      'cancelada',
      wompiStatus === 'EXPIRED' ? 'EXPIRED' : wompiStatus,
      motivo,
    )
  }

  if (compraId && estado !== 'aprobada') {
    const { error: compraError } = await supabaseClient
      .from('compras')
      .update({
        estado_pago: 'fallido',
        estado_compra: 'cancelada',
        fecha_cancelacion: now,
        motivo_cancelacion: motivo,
      })
      .eq('id', compraId)
    if (compraError) throw compraError

    const { error: liberarCompraError } = await supabaseClient.rpc('cancelar_reserva_palcos_compra', {
      p_compra_id: compraId,
    })
    if (liberarCompraError && !isMissingRpcError(liberarCompraError)) throw liberarCompraError
  }

  if (estado !== 'aprobada') {
    const { error: liberarCheckoutError } = await supabaseClient.rpc('cancelar_reserva_palcos_checkout', {
      p_transaccion_checkout_id: checkoutId,
    })
    if (liberarCheckoutError && !isMissingRpcError(liberarCheckoutError)) throw liberarCheckoutError
  }
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

    const ttlMinutes = resolvePendingTtlMinutes()
    const batchLimit = resolveBatchLimit()
    const cutoffIso = new Date(Date.now() - ttlMinutes * 60_000).toISOString()

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)

    let { data: pendientes, error: pendientesError } = await supabaseClient
      .from('transacciones_producto')
      .select(
        'id, evento_id, compra_producto_id, wompi_cuenta_id, wompi_transaction_id, wompi_reference, estado, wompi_status, es_activa, fecha_creacion, response_payload, webhook_payload',
      )
      .eq('estado', 'pendiente')
      .eq('es_activa', true)
      .lte('fecha_creacion', cutoffIso)
      .order('fecha_creacion', { ascending: true })
      .limit(batchLimit)

    if (pendientesError) {
      if (isMissingTableError(pendientesError)) {
        pendientes = []
        pendientesError = null
      } else {
        // Compatibilidad: algunos ambientes legacy no tienen response_payload/webhook_payload.
        const { data: pendientesFallback, error: pendientesFallbackError } = await supabaseClient
          .from('transacciones_producto')
          .select(
            'id, evento_id, compra_producto_id, wompi_cuenta_id, wompi_transaction_id, wompi_reference, estado, wompi_status, es_activa, fecha_creacion',
          )
          .eq('estado', 'pendiente')
          .eq('es_activa', true)
          .lte('fecha_creacion', cutoffIso)
          .order('fecha_creacion', { ascending: true })
          .limit(batchLimit)

        if (pendientesFallbackError) {
          if (isMissingTableError(pendientesFallbackError)) {
            pendientes = []
            pendientesError = null
          } else {
            throw pendientesFallbackError
          }
        } else {
          pendientes = (pendientesFallback || []).map((row) => ({
            ...row,
            response_payload: null,
            webhook_payload: null,
          }))
          pendientesError = null
        }
      }
    }

    const summary = {
      ttl_minutes: ttlMinutes,
      cutoff: cutoffIso,
      found: 0,
      found_orphan: 0,
      processed: 0,
      expired: 0,
      rejected_or_voided: 0,
      approved_skipped: 0,
      approved_materialized: 0,
      approved_already_materialized: 0,
      approved_orphan_skipped: 0,
      errors: 0,
      error_details: [] as string[],
      checkout_found: 0,
      checkout_orphan_found: 0,
      checkout_processed: 0,
      checkout_expired: 0,
      checkout_rejected_or_voided: 0,
      checkout_approved_skipped: 0,
      checkout_approved_materialized: 0,
      checkout_approved_already_materialized: 0,
      checkout_approved_orphan_skipped: 0,
    }

    let productoOrphans: typeof pendientes = []
    const { data: productoOrphansRaw, error: productoOrphansError } = await supabaseClient
      .from('transacciones_producto')
      .select(
        'id, evento_id, compra_producto_id, wompi_cuenta_id, wompi_transaction_id, wompi_reference, estado, wompi_status, es_activa, fecha_creacion, response_payload, webhook_payload',
      )
      .or('estado.eq.aprobada,wompi_status.eq.APPROVED')
      .is('compra_producto_id', null)
      .order('fecha_creacion', { ascending: true })
      .limit(batchLimit)

    if (productoOrphansError) {
      if (!isMissingTableError(productoOrphansError)) {
        summary.errors += 1
        summary.error_details.push(`producto_orphan_query -> ${productoOrphansError.message}`)
      }
    } else {
      productoOrphans = productoOrphansRaw
    }

    const productoRows = mergeRowsById(pendientes, productoOrphans)
    summary.found = productoRows.length
    summary.found_orphan = productoOrphans?.length || 0

    const credentialCache = new Map<string, WompiAccountCache>()

    for (const txn of productoRows) {
      summary.processed += 1
      try {
        const eventoId = txn.evento_id ? Number(txn.evento_id) : null
        const wompiCuentaId = txn.wompi_cuenta_id ? Number(txn.wompi_cuenta_id) : null
        const compraProductoId = txn.compra_producto_id ? Number(txn.compra_producto_id) : null
        const txnId = Number(txn.id)
        const wompiReference = txn.wompi_reference ? String(txn.wompi_reference) : null

        const credentials = await resolveWompiCredentials(
          supabaseClient,
          eventoId,
          wompiCuentaId,
          credentialCache,
        )
        const wompiBaseUrl = credentials.environment === 'production'
          ? 'https://production.wompi.co/v1'
          : 'https://sandbox.wompi.co/v1'

        const idsToTry = new Set<string>()
        if (txn.wompi_transaction_id) idsToTry.add(String(txn.wompi_transaction_id))
        for (const id of extractTransactionIds(txn.response_payload)) idsToTry.add(id)
        for (const id of extractTransactionIds(txn.webhook_payload)) idsToTry.add(id)

        let transaction: Record<string, unknown> | null = null
        for (const id of idsToTry) {
          const found = await fetchTransactionById(wompiBaseUrl, credentials.privateKey, id)
          if (found) {
            transaction = found
            break
          }
        }

        if (!transaction && wompiReference) {
          transaction = await fetchTransactionByReference(wompiBaseUrl, credentials.privateKey, wompiReference)
        }

        const wompiStatus = String(transaction?.status || '').toUpperCase()
        const dbApproved = isDbWompiApproved(txn.estado, txn.wompi_status)
        const needsMaterialization = productoTxnNeedsMaterialization(compraProductoId)
        const approvedOrphan = dbApproved && needsMaterialization

        if (wompiStatus === 'APPROVED') {
          if (!transaction) {
            summary.approved_skipped += 1
            continue
          }
          if (!productoTxnNeedsMaterialization(compraProductoId)) {
            summary.approved_already_materialized += 1
            continue
          }
          await runSyntheticWebhook(
            supabaseUrl,
            supabaseServiceKey,
            credentials.environment,
            transaction,
          )
          summary.approved_materialized += 1
          continue
        }

        if (approvedOrphan) {
          summary.approved_orphan_skipped += 1
          continue
        }

        if (wompiStatus === 'DECLINED' || wompiStatus === 'VOIDED' || wompiStatus === 'ERROR') {
          const estado = mapFinalStatusToEstado(wompiStatus)
          await closeTransaccionProducto(
            supabaseClient,
            txnId,
            compraProductoId,
            estado,
            wompiStatus,
            `Pago de productos finalizado sin aprobación (${wompiStatus})`,
          )
          summary.rejected_or_voided += 1
          continue
        }

        await closeTransaccionProducto(
          supabaseClient,
          txnId,
          compraProductoId,
          'cancelada',
          'EXPIRED',
          'Pago de productos no completado: checkout abandonado o link expirado',
        )
        summary.expired += 1
      } catch (err) {
        summary.errors += 1
        summary.error_details.push(`txn:${txn.id} -> ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    {
      const checkoutSelect =
        'id, evento_id, compra_id, compra_producto_id, compra_cover_id, wompi_cuenta_id, wompi_transaction_id, wompi_reference, estado, wompi_status, es_activa, materializado, fecha_creacion, response_payload, webhook_payload, metadata'

      const { data: checkoutsPending, error: checkoutPendingError } = await supabaseClient
        .from('transacciones_checkout')
        .select(checkoutSelect)
        .eq('estado', 'pendiente')
        .eq('es_activa', true)
        .lte('fecha_creacion', cutoffIso)
        .order('fecha_creacion', { ascending: true })
        .limit(batchLimit)

      const { data: checkoutsOrphanRaw, error: checkoutOrphanError } = await supabaseClient
        .from('transacciones_checkout')
        .select(checkoutSelect)
        .or('estado.eq.aprobada,wompi_status.eq.APPROVED')
        .or('materializado.eq.false,materializado.is.null')
        .is('compra_id', null)
        .is('compra_producto_id', null)
        .is('compra_cover_id', null)
        .order('fecha_creacion', { ascending: true })
        .limit(batchLimit)

      let checkoutsPendingSafe = checkoutsPending
      if (checkoutPendingError) {
        if (isMissingTableError(checkoutPendingError)) {
          checkoutsPendingSafe = []
        } else {
          summary.errors += 1
          summary.error_details.push(`checkout_query -> ${checkoutPendingError.message}`)
          checkoutsPendingSafe = []
        }
      }

      let checkoutsOrphanSafe = checkoutsOrphanRaw
      if (checkoutOrphanError) {
        if (isMissingTableError(checkoutOrphanError)) {
          checkoutsOrphanSafe = []
        } else {
          summary.errors += 1
          summary.error_details.push(`checkout_orphan_query -> ${checkoutOrphanError.message}`)
          checkoutsOrphanSafe = []
        }
      }

      const checkouts = mergeRowsById(checkoutsPendingSafe, checkoutsOrphanSafe)
      summary.checkout_found = checkouts.length
      summary.checkout_orphan_found = checkoutsOrphanSafe?.length || 0

      for (const row of checkouts) {
          summary.checkout_processed += 1
          try {
            const eventoId = row.evento_id ? Number(row.evento_id) : null
            const wompiCuentaId = row.wompi_cuenta_id ? Number(row.wompi_cuenta_id) : null
            const checkoutId = Number(row.id)
            const compraId = row.compra_id ? Number(row.compra_id) : null
            const compraProductoId = row.compra_producto_id ? Number(row.compra_producto_id) : null
            const compraCoverId = row.compra_cover_id ? Number(row.compra_cover_id) : null
            const meta = (row.metadata || {}) as Record<string, unknown>
            const transaccionProductoId = Number(meta.transaccion_producto_id ?? 0) || null

            const credentials = await resolveWompiCredentials(
              supabaseClient,
              eventoId,
              wompiCuentaId,
              credentialCache,
            )
            const wompiBaseUrl = credentials.environment === 'production'
              ? 'https://production.wompi.co/v1'
              : 'https://sandbox.wompi.co/v1'

            const idsToTry = new Set<string>()
            if (row.wompi_transaction_id) idsToTry.add(String(row.wompi_transaction_id))
            for (const id of extractTransactionIds(row.response_payload)) idsToTry.add(id)
            for (const id of extractTransactionIds(row.webhook_payload)) idsToTry.add(id)

            let transaction: Record<string, unknown> | null = null
            for (const id of idsToTry) {
              const found = await fetchTransactionById(wompiBaseUrl, credentials.privateKey, id)
              if (found) {
                transaction = found
                break
              }
            }
            if (!transaction && row.wompi_reference) {
              transaction = await fetchTransactionByReference(
                wompiBaseUrl,
                credentials.privateKey,
                String(row.wompi_reference),
              )
            }

            const wompiStatus = String(transaction?.status || '').toUpperCase()
            const dbApproved = isDbWompiApproved(row.estado, row.wompi_status)
            const needsMaterialization = checkoutNeedsMaterialization(row)
            const approvedOrphan = dbApproved && needsMaterialization

            if (wompiStatus === 'APPROVED') {
              if (!transaction) {
                summary.checkout_approved_skipped += 1
                continue
              }
              if (!checkoutNeedsMaterialization(row)) {
                summary.checkout_approved_already_materialized += 1
                continue
              }
              await runSyntheticWebhook(
                supabaseUrl,
                supabaseServiceKey,
                credentials.environment,
                transaction,
              )
              summary.checkout_approved_materialized += 1
              continue
            }

            if (approvedOrphan) {
              summary.checkout_approved_orphan_skipped += 1
              continue
            }

            if (wompiStatus === 'DECLINED' || wompiStatus === 'VOIDED' || wompiStatus === 'ERROR') {
              const estado = mapFinalStatusToEstado(wompiStatus)
              await closeTransaccionCheckout(
                supabaseClient,
                checkoutId,
                estado,
                wompiStatus,
                `Checkout finalizado sin aprobación (${wompiStatus})`,
                compraId,
                compraProductoId,
                compraCoverId,
                transaccionProductoId,
              )
              summary.checkout_rejected_or_voided += 1
              continue
            }

            await closeTransaccionCheckout(
              supabaseClient,
              checkoutId,
              'expirada',
              'EXPIRED',
              'Checkout no completado: link expirado o abandono',
              compraId,
              compraProductoId,
              compraCoverId,
              transaccionProductoId,
            )
            summary.checkout_expired += 1
          } catch (err) {
            summary.errors += 1
            summary.error_details.push(`checkout:${row.id} -> ${err instanceof Error ? err.message : String(err)}`)
          }
        }
    }

    return new Response(
      JSON.stringify({ success: true, version: WOMPI_EXPIRE_PENDING_VERSION, summary }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('wompi-expire-pending error:', message)
    return new Response(
      JSON.stringify({ success: false, error: message }),
      // Responder 200 evita que pg_cron marque el job como fallido por errores de compatibilidad.
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    )
  }
})
