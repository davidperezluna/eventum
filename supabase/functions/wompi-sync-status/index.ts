import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ENV_VAR_NAME_REGEX = /^[A-Z][A-Z0-9_]*$/

function resolveProductosPendingTtlMinutes(): number {
  const raw = Number(Deno.env.get('WOMPI_PRODUCT_PENDING_TTL_MINUTES') || 30)
  if (!Number.isFinite(raw)) return 30
  return Math.min(1440, Math.max(5, Math.floor(raw)))
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

async function resolveWompiPrivateKey(
  supabaseClient: ReturnType<typeof createClient>,
  eventoId: number | null,
  wompiCuentaIdHint: number | null,
): Promise<{ privateKey: string; environment: string }> {
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
      .select('private_key_env, environment_env, activo')
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

  return { privateKey, environment }
}

function isFinalWompiStatus(status: string | null | undefined): boolean {
  return ['APPROVED', 'DECLINED', 'VOIDED', 'ERROR'].includes(String(status || '').toUpperCase())
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

async function fetchTransactionById(
  wompiBaseUrl: string,
  privateKey: string,
  wompiTransactionId: string,
): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${wompiBaseUrl}/transactions/${encodeURIComponent(wompiTransactionId)}`, {
    headers: { Authorization: `Bearer ${privateKey}` },
  })
  const data = await response.json()
  if (!response.ok) {
    return null
  }
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
  if (!response.ok) {
    return null
  }

  const rows = Array.isArray(data?.data) ? data.data : (data?.data ? [data.data] : [])
  if (!rows.length) return null
  const chosen =
    rows.find((row: Record<string, unknown>) => isFinalWompiStatus(String(row.status || ''))) ||
    rows[rows.length - 1]
  return chosen as Record<string, unknown>
}

async function runSyntheticWebhook(
  supabaseUrl: string,
  supabaseServiceKey: string,
  environment: string,
  transaction: Record<string, unknown>,
) {
  const syntheticWebhook = {
    event: 'transaction.updated',
    data: { transaction },
    environment: environment === 'production' ? 'prod' : 'test',
    timestamp: Math.floor(Date.now() / 1000),
    sent_at: new Date().toISOString(),
    source: 'wompi-sync-status',
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
    throw new Error(webhookResult?.error || 'El webhook interno no procesó la sincronización')
  }
  if (webhookResult?.error) {
    throw new Error(String(webhookResult.error))
  }
  return webhookResult
}

async function expirarTransaccionProductoPendiente(
  supabaseClient: ReturnType<typeof createClient>,
  transaccionProductoId: number,
  compraProductoId: number | null,
): Promise<void> {
  const now = new Date().toISOString()
  const motivo = 'Pago no completado: transacción expirada o abandonada en checkout Wompi'

  const { error: txnError } = await supabaseClient
    .from('transacciones_producto')
    .update({
      estado: 'cancelada',
      wompi_status: 'EXPIRED',
      es_activa: false,
      fecha_actualizacion: now,
      webhook_payload: { source: 'wompi-sync-status', reason: motivo, expired_at: now },
    })
    .eq('id', transaccionProductoId)

  if (txnError) {
    throw txnError
  }

  if (compraProductoId) {
    const { error: compraError } = await supabaseClient
      .from('compras_productos')
      .update({
        estado_pago: 'fallido',
        estado_compra: 'cancelada',
        fecha_cancelacion: now,
        motivo_cancelacion: motivo,
      })
      .eq('id', compraProductoId)

    if (compraError) {
      throw compraError
    }

    const { error: itemsError } = await supabaseClient
      .from('compras_productos_items')
      .update({ estado: 'cancelado' })
      .eq('compra_producto_id', compraProductoId)
      .eq('estado', 'pendiente')

    if (itemsError) {
      throw itemsError
    }
  }
}

async function expirarTransaccionCheckoutPendiente(
  supabaseClient: ReturnType<typeof createClient>,
  transaccionCheckoutId: number,
): Promise<void> {
  const now = new Date().toISOString()
  const motivo = 'Pago no completado: intento de checkout expirado o abandonado'

  const { data: checkout } = await supabaseClient
    .from('transacciones_checkout')
    .select('id, compra_id')
    .eq('id', transaccionCheckoutId)
    .maybeSingle()

  const { error } = await supabaseClient
    .from('transacciones_checkout')
    .update({
      estado: 'expirada',
      wompi_status: 'EXPIRED',
      es_activa: false,
      fecha_cancelacion: now,
      motivo_cancelacion: motivo,
      webhook_payload: { source: 'wompi-sync-status', reason: motivo, expired_at: now },
    })
    .eq('id', transaccionCheckoutId)

  if (error) throw error

  const { error: liberarCheckoutError } = await supabaseClient.rpc('cancelar_reserva_palcos_checkout', {
    p_transaccion_checkout_id: transaccionCheckoutId,
  })
  if (liberarCheckoutError && !isMissingRpcError(liberarCheckoutError)) {
    throw liberarCheckoutError
  }

  const compraId = checkout?.compra_id ? Number(checkout.compra_id) : null
  if (compraId) {
    await supabaseClient
      .from('compras')
      .update({
        estado_pago: 'fallido',
        estado_compra: 'cancelada',
        fecha_cancelacion: now,
        motivo_cancelacion: motivo,
      })
      .eq('id', compraId)

    const { error: liberarCompraError } = await supabaseClient.rpc('cancelar_reserva_palcos_compra', {
      p_compra_id: compraId,
    })
    if (liberarCompraError && !isMissingRpcError(liberarCompraError)) {
      throw liberarCompraError
    }
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

    const body = await req.json() as {
      transaccion_producto_id?: number
      transaccion_checkout_id?: number
      compra_id?: number
      wompi_transaction_id?: string
      force_cancel?: boolean
    }

    const transaccionProductoId = body.transaccion_producto_id
      ? Number(body.transaccion_producto_id)
      : null
    let compraId = body.compra_id ? Number(body.compra_id) : null
    const transaccionCheckoutId = body.transaccion_checkout_id
      ? Number(body.transaccion_checkout_id)
      : null
    const wompiTransactionId = body.wompi_transaction_id?.trim() || null
    const forceCancel = !!body.force_cancel

    if (!transaccionProductoId && !compraId && !transaccionCheckoutId && !wompiTransactionId) {
      throw new Error('wompi_transaction_id, transaccion_producto_id, transaccion_checkout_id o compra_id es requerido')
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)

    let eventoId: number | null = null
    let wompiCuentaId: number | null = null
    let wompiReference: string | null = null
    let compraProductoId: number | null = null
    let fechaCreacionTxn: string | null = null
    let estadoTxn: string | null = null
    let wompiStatusTxn: string | null = null
    let esActivaTxn: boolean | null = null
    let wompiTransactionStored: string | null = null
    let estadoCheckout: string | null = null
    let wompiStatusCheckout: string | null = null
    let fechaCreacionCheckout: string | null = null
    let esActivaCheckout: boolean | null = null

    if (transaccionCheckoutId) {
      let checkout: Record<string, unknown> | null = null
      try {
        const { data } = await supabaseClient
          .from('transacciones_checkout')
          .select(
            'id, evento_id, wompi_cuenta_id, compra_id, compra_producto_id, estado, wompi_status, wompi_reference, wompi_transaction_id, fecha_creacion, es_activa, metadata',
          )
          .eq('id', transaccionCheckoutId)
          .maybeSingle()
        checkout = data
      } catch (e) {
        throw new Error(`No se pudo consultar transacciones_checkout: ${(e as Error).message}`)
      }

      if (!checkout) {
        throw new Error(`Transacción checkout ${transaccionCheckoutId} no encontrada`)
      }

      if (checkout.estado === 'aprobada' || checkout.wompi_status === 'APPROVED') {
        return new Response(
          JSON.stringify({ success: true, already_synced: true, status: 'APPROVED' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
        )
      }

      if (!compraId && checkout.compra_id) compraId = Number(checkout.compra_id)
      if (!compraProductoId && checkout.compra_producto_id) compraProductoId = Number(checkout.compra_producto_id)
      eventoId = checkout.evento_id ? Number(checkout.evento_id) : eventoId
      wompiCuentaId = checkout.wompi_cuenta_id ? Number(checkout.wompi_cuenta_id) : wompiCuentaId
      wompiReference = checkout.wompi_reference ? String(checkout.wompi_reference) : wompiReference
      wompiTransactionStored = checkout.wompi_transaction_id ? String(checkout.wompi_transaction_id) : wompiTransactionStored
      estadoCheckout = checkout.estado ? String(checkout.estado) : null
      wompiStatusCheckout = checkout.wompi_status ? String(checkout.wompi_status) : null
      fechaCreacionCheckout = checkout.fecha_creacion ? String(checkout.fecha_creacion) : null
      esActivaCheckout = checkout.es_activa == null ? null : !!checkout.es_activa

      if (forceCancel) {
        const estadoActual = String(checkout.estado || '').toLowerCase()
        const yaCerrada =
          checkout.es_activa === false ||
          ['cancelada', 'expirada', 'rechazada', 'error', 'aprobada'].includes(estadoActual)

        if (yaCerrada) {
          return new Response(
            JSON.stringify({
              success: true,
              force_cancelled: true,
              already_closed: true,
              status: String(checkout.wompi_status || 'UNKNOWN'),
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
          )
        }

        await expirarTransaccionCheckoutPendiente(supabaseClient, transaccionCheckoutId)
        return new Response(
          JSON.stringify({ success: true, force_cancelled: true, status: 'EXPIRED' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
        )
      }
    }

    if (transaccionProductoId) {
      const { data: txn } = await supabaseClient
        .from('transacciones_producto')
        .select('id, evento_id, wompi_cuenta_id, estado, wompi_status, wompi_reference, compra_producto_id, fecha_creacion, es_activa, wompi_transaction_id')
        .eq('id', transaccionProductoId)
        .maybeSingle()

      if (!txn) {
        throw new Error(`Transacción producto ${transaccionProductoId} no encontrada`)
      }

      if (txn.estado === 'aprobada' || txn.wompi_status === 'APPROVED') {
        return new Response(
          JSON.stringify({ success: true, already_synced: true, status: 'APPROVED' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
        )
      }

      eventoId = txn.evento_id ? Number(txn.evento_id) : null
      wompiCuentaId = txn.wompi_cuenta_id ? Number(txn.wompi_cuenta_id) : null
      wompiReference = txn.wompi_reference ? String(txn.wompi_reference) : null
      compraProductoId = txn.compra_producto_id ? Number(txn.compra_producto_id) : null
      fechaCreacionTxn = txn.fecha_creacion ? String(txn.fecha_creacion) : null
      estadoTxn = txn.estado ? String(txn.estado) : null
      wompiStatusTxn = txn.wompi_status ? String(txn.wompi_status) : null
      esActivaTxn = txn.es_activa == null ? null : !!txn.es_activa
      wompiTransactionStored = txn.wompi_transaction_id ? String(txn.wompi_transaction_id) : null
    }

    if (compraId) {
      const { data: compra } = await supabaseClient
        .from('compras')
        .select('id, evento_id, wompi_cuenta_id, estado_pago, wompi_status')
        .eq('id', compraId)
        .maybeSingle()

      if (!compra) {
        throw new Error(`Compra ${compraId} no encontrada`)
      }

      if (compra.estado_pago === 'completado' || compra.wompi_status === 'APPROVED') {
        return new Response(
          JSON.stringify({ success: true, already_synced: true, status: 'APPROVED' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
        )
      }

      eventoId = eventoId ?? (compra.evento_id ? Number(compra.evento_id) : null)
      wompiCuentaId = wompiCuentaId ?? (compra.wompi_cuenta_id ? Number(compra.wompi_cuenta_id) : null)
    }

    const { privateKey, environment } = await resolveWompiPrivateKey(
      supabaseClient,
      eventoId,
      wompiCuentaId,
    )

    const wompiBaseUrl = environment === 'production'
      ? 'https://production.wompi.co/v1'
      : 'https://sandbox.wompi.co/v1'

    const idsToTry = new Set<string>()
    if (wompiTransactionId) idsToTry.add(wompiTransactionId)
    if (wompiTransactionStored) idsToTry.add(wompiTransactionStored)

    let transaction: Record<string, unknown> | null = null
    let lookupSource: 'transaction_id' | 'reference' | null = null

    for (const id of idsToTry) {
      const byId = await fetchTransactionById(wompiBaseUrl, privateKey, id)
      if (byId) {
        transaction = byId
        lookupSource = 'transaction_id'
        break
      }
    }

    if (!transaction && wompiReference) {
      const byReference = await fetchTransactionByReference(wompiBaseUrl, privateKey, wompiReference)
      if (byReference) {
        transaction = byReference
        lookupSource = 'reference'
      }
    }

    if (transaction) {
      const webhookResult = await runSyntheticWebhook(supabaseUrl, supabaseServiceKey, environment, transaction)
      return new Response(
        JSON.stringify({
          success: true,
          wompi_status: transaction.status,
          webhook: webhookResult,
          lookup_source: lookupSource,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      )
    }

    if (transaccionCheckoutId && estadoCheckout === 'pendiente' && esActivaCheckout !== false) {
      const createdAtMs = fechaCreacionCheckout ? Date.parse(fechaCreacionCheckout) : Number.NaN
      const ttlMs = resolveProductosPendingTtlMinutes() * 60_000
      const isOlderThanTtl = Number.isFinite(createdAtMs) && Date.now() - createdAtMs >= ttlMs
      const wompiIsPending = !wompiStatusCheckout || String(wompiStatusCheckout).toUpperCase() === 'PENDING'

      if (isOlderThanTtl && wompiIsPending) {
        await expirarTransaccionCheckoutPendiente(supabaseClient, transaccionCheckoutId)
      }
    }

    if (transaccionProductoId && estadoTxn === 'pendiente' && esActivaTxn !== false) {
      const createdAtMs = fechaCreacionTxn ? Date.parse(fechaCreacionTxn) : Number.NaN
      const ttlMs = resolveProductosPendingTtlMinutes() * 60_000
      const isOlderThanTtl = Number.isFinite(createdAtMs) && Date.now() - createdAtMs >= ttlMs
      const wompiIsPending = !wompiStatusTxn || String(wompiStatusTxn).toUpperCase() === 'PENDING'

      if (isOlderThanTtl && wompiIsPending) {
        await expirarTransaccionProductoPendiente(supabaseClient, transaccionProductoId, compraProductoId)
        return new Response(
          JSON.stringify({
            success: true,
            expired: true,
            wompi_status: 'EXPIRED',
            transaccion_producto_id: transaccionProductoId,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          },
        )
      }
    }

    const message = !wompiTransactionId && !wompiTransactionStored && !wompiReference
      ? 'No hay identificador Wompi para sincronizar'
      : 'No se encontró transacción en Wompi aún'
    return new Response(
      JSON.stringify({
        success: false,
        wompi_status: 'PENDING',
        message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('=== Error en wompi-sync-status ===', error)
    const message = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
    )
  }
})
