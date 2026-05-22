import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
      compra_id?: number
      wompi_transaction_id?: string
    }

    const transaccionProductoId = body.transaccion_producto_id
      ? Number(body.transaccion_producto_id)
      : null
    const compraId = body.compra_id ? Number(body.compra_id) : null
    const wompiTransactionId = body.wompi_transaction_id?.trim() || null

    if (!transaccionProductoId && !compraId) {
      throw new Error('transaccion_producto_id o compra_id es requerido')
    }
    if (!wompiTransactionId) {
      throw new Error('wompi_transaction_id es requerido')
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)

    let eventoId: number | null = null
    let wompiCuentaId: number | null = null

    if (transaccionProductoId) {
      const { data: txn } = await supabaseClient
        .from('transacciones_producto')
        .select('id, evento_id, wompi_cuenta_id, estado, wompi_status')
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

    const wompiResponse = await fetch(`${wompiBaseUrl}/transactions/${encodeURIComponent(wompiTransactionId)}`, {
      headers: {
        Authorization: `Bearer ${privateKey}`,
      },
    })

    const wompiData = await wompiResponse.json()
    if (!wompiResponse.ok) {
      throw new Error(
        wompiData?.error?.message || wompiData?.error?.reason || 'No se pudo consultar la transacción en Wompi',
      )
    }

    const transaction = wompiData.data as Record<string, unknown> | undefined
    if (!transaction?.status) {
      throw new Error('Respuesta de Wompi sin estado de transacción')
    }

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

    return new Response(
      JSON.stringify({
        success: true,
        wompi_status: transaction.status,
        webhook: webhookResult,
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
