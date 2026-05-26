import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

function isUnifiedCheckoutEnabled(): boolean {
  const raw = String(Deno.env.get('CHECKOUT_UNIFICADO_ENABLED') || '').trim().toLowerCase()
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on'
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

async function closeTransaccionCheckout(
  supabaseClient: ReturnType<typeof createClient>,
  checkoutId: number,
  estado: string,
  wompiStatus: string,
  motivo: string,
  compraId: number | null,
  compraProductoId: number | null,
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

async function closeCompraLegacy(
  supabaseClient: ReturnType<typeof createClient>,
  compraId: number,
  wompiStatus: string,
  motivo: string,
): Promise<void> {
  const now = new Date().toISOString()
  const estadoPago = wompiStatus === 'APPROVED' ? 'completado' : 'fallido'
  const estadoCompra = wompiStatus === 'APPROVED' ? 'confirmada' : 'cancelada'

  const { error: compraError } = await supabaseClient
    .from('compras')
    .update({
      wompi_status: wompiStatus,
      estado_pago: estadoPago,
      estado_compra: estadoCompra,
      fecha_confirmacion: wompiStatus === 'APPROVED' ? now : null,
      fecha_cancelacion: wompiStatus === 'APPROVED' ? null : now,
      motivo_cancelacion: wompiStatus === 'APPROVED' ? null : motivo,
    })
    .eq('id', compraId)

  if (compraError) throw compraError

  if (wompiStatus !== 'APPROVED') {
    const { error: liberarError } = await supabaseClient.rpc('cancelar_reserva_palcos_compra', {
      p_compra_id: compraId,
    })
    if (liberarError && !isMissingRpcError(liberarError)) throw liberarError
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
      found: pendientes?.length || 0,
      processed: 0,
      expired: 0,
      rejected_or_voided: 0,
      approved_skipped: 0,
      errors: 0,
      error_details: [] as string[],
      checkout_found: 0,
      checkout_processed: 0,
      checkout_expired: 0,
      checkout_rejected_or_voided: 0,
      checkout_approved_skipped: 0,
      compras_legacy_found: 0,
      compras_legacy_processed: 0,
      compras_legacy_expired: 0,
      compras_legacy_rejected_or_voided: 0,
      compras_legacy_approved_skipped: 0,
    }

    const credentialCache = new Map<string, WompiAccountCache>()

    for (const txn of pendientes || []) {
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
        if (wompiStatus === 'APPROVED') {
          summary.approved_skipped += 1
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
      const { data: checkouts, error: checkoutError } = await supabaseClient
        .from('transacciones_checkout')
        .select(
          'id, evento_id, compra_id, compra_producto_id, wompi_cuenta_id, wompi_transaction_id, wompi_reference, estado, wompi_status, es_activa, fecha_creacion, response_payload, webhook_payload, metadata',
        )
        .eq('estado', 'pendiente')
        .eq('es_activa', true)
        .lte('fecha_creacion', cutoffIso)
        .order('fecha_creacion', { ascending: true })
        .limit(batchLimit)

      if (checkoutError) {
        if (!isMissingTableError(checkoutError)) {
          summary.errors += 1
          summary.error_details.push(`checkout_query -> ${checkoutError.message}`)
        }
      } else {
        summary.checkout_found = checkouts?.length || 0
        for (const row of checkouts || []) {
          summary.checkout_processed += 1
          try {
            const eventoId = row.evento_id ? Number(row.evento_id) : null
            const wompiCuentaId = row.wompi_cuenta_id ? Number(row.wompi_cuenta_id) : null
            const checkoutId = Number(row.id)
            const compraId = row.compra_id ? Number(row.compra_id) : null
            const compraProductoId = row.compra_producto_id ? Number(row.compra_producto_id) : null
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
            if (wompiStatus === 'APPROVED') {
              summary.checkout_approved_skipped += 1
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
              transaccionProductoId,
            )
            summary.checkout_expired += 1
          } catch (err) {
            summary.errors += 1
            summary.error_details.push(`checkout:${row.id} -> ${err instanceof Error ? err.message : String(err)}`)
          }
        }
      }
    }

    {
      const { data: comprasLegacy, error: comprasLegacyError } = await supabaseClient
        .from('compras')
        .select(
          'id, evento_id, wompi_cuenta_id, wompi_transaction_id, wompi_reference, wompi_response, wompi_webhook_data, estado_pago, estado_compra, fecha_compra',
        )
        .eq('estado_pago', 'pendiente')
        .eq('estado_compra', 'pendiente')
        .lte('fecha_compra', cutoffIso)
        .order('fecha_compra', { ascending: true })
        .limit(batchLimit)

      if (comprasLegacyError) {
        summary.errors += 1
        summary.error_details.push(`compras_legacy_query -> ${comprasLegacyError.message}`)
      } else {
        summary.compras_legacy_found = comprasLegacy?.length || 0

        for (const compra of comprasLegacy || []) {
          summary.compras_legacy_processed += 1
          try {
            const eventoId = compra.evento_id ? Number(compra.evento_id) : null
            const wompiCuentaId = compra.wompi_cuenta_id ? Number(compra.wompi_cuenta_id) : null
            const compraId = Number(compra.id)
            const wompiReference = compra.wompi_reference ? String(compra.wompi_reference) : null

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
            if (compra.wompi_transaction_id) idsToTry.add(String(compra.wompi_transaction_id))
            for (const id of extractTransactionIds(compra.wompi_response)) idsToTry.add(id)
            for (const id of extractTransactionIds(compra.wompi_webhook_data)) idsToTry.add(id)

            let transaction: Record<string, unknown> | null = null
            for (const id of idsToTry) {
              const found = await fetchTransactionById(wompiBaseUrl, credentials.privateKey, id)
              if (found) {
                transaction = found
                break
              }
            }
            if (!transaction && wompiReference) {
              transaction = await fetchTransactionByReference(
                wompiBaseUrl,
                credentials.privateKey,
                wompiReference,
              )
            }

            const wompiStatus = String(transaction?.status || '').toUpperCase()
            if (wompiStatus === 'APPROVED') {
              summary.compras_legacy_approved_skipped += 1
              continue
            }

            if (wompiStatus === 'DECLINED' || wompiStatus === 'VOIDED' || wompiStatus === 'ERROR') {
              await closeCompraLegacy(
                supabaseClient,
                compraId,
                wompiStatus,
                `Compra legacy finalizada sin aprobación (${wompiStatus})`,
              )
              summary.compras_legacy_rejected_or_voided += 1
              continue
            }

            await closeCompraLegacy(
              supabaseClient,
              compraId,
              'EXPIRED',
              'Compra legacy no completada: checkout abandonado o link expirado',
            )
            summary.compras_legacy_expired += 1
          } catch (err) {
            summary.errors += 1
            summary.error_details.push(`compra_legacy:${compra.id} -> ${err instanceof Error ? err.message : String(err)}`)
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, summary }),
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
