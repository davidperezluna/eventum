import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ADMIN_TIPO_USUARIO_ID = 3
const ONESIGNAL_API_URL = 'https://api.onesignal.com/notifications'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalizeEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

type TargetingMode = 'email' | 'external_id'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método no permitido' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const oneSignalAppId = Deno.env.get('ONESIGNAL_APP_ID') ?? ''
    const oneSignalRestApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY') ?? ''

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase no configurado en la Edge Function')
    }
    if (!oneSignalAppId || !oneSignalRestApiKey) {
      return jsonResponse({
        error: 'Configura ONESIGNAL_APP_ID y ONESIGNAL_REST_API_KEY en Supabase → Edge Functions → Secrets',
      }, 500)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'No autorizado' }, 401)
    }

    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!jwt) {
      return jsonResponse({ error: 'Token de sesión ausente' }, 401)
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    const {
      data: { user: callerAuthUser },
      error: callerAuthError,
    } = await adminClient.auth.getUser(jwt)

    if (callerAuthError || !callerAuthUser) {
      return jsonResponse({ error: 'Sesión inválida o expirada' }, 401)
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
      return jsonResponse({ error: 'Solo administradores pueden enviar correos de prueba' }, 403)
    }

    const body = await req.json() as {
      usuario_id?: number
      email?: string
      auth_user_id?: string
      email_subject?: string
      email_body?: string
      template_id?: string
      targeting?: TargetingMode
    }

    const emailSubject = String(body.email_subject ?? '').trim()
    const emailBody = String(body.email_body ?? '').trim()
    const templateId = String(body.template_id ?? '').trim()
    const targeting: TargetingMode = body.targeting === 'external_id' ? 'external_id' : 'email'

    if (!emailSubject && !templateId) {
      return jsonResponse({ error: 'Indica asunto (email_subject) o template_id de OneSignal' }, 400)
    }
    if (!emailBody && !templateId) {
      return jsonResponse({ error: 'Indica cuerpo HTML (email_body) o template_id de OneSignal' }, 400)
    }

    let recipientEmail = normalizeEmail(body.email)
    let recipientAuthUserId = String(body.auth_user_id ?? '').trim()

    if (body.usuario_id != null && Number.isFinite(Number(body.usuario_id))) {
      const { data: targetUser, error: targetError } = await adminClient
        .from('usuarios')
        .select('id, email, auth_user_id, nombre, apellido')
        .eq('id', Number(body.usuario_id))
        .maybeSingle()

      if (targetError) {
        throw targetError
      }
      if (!targetUser) {
        return jsonResponse({ error: 'Usuario destino no encontrado' }, 404)
      }

      recipientEmail = normalizeEmail(targetUser.email)
      recipientAuthUserId = String(targetUser.auth_user_id ?? '').trim()
    }

    if (targeting === 'email') {
      if (!recipientEmail || !recipientEmail.includes('@')) {
        return jsonResponse({ error: 'El usuario destino no tiene un correo válido' }, 400)
      }
    } else if (!recipientAuthUserId) {
      return jsonResponse({
        error: 'El usuario destino no tiene auth_user_id; usa envío por correo directo',
      }, 400)
    }

    const oneSignalPayload: Record<string, unknown> = {
      app_id: oneSignalAppId,
      target_channel: 'email',
      include_unsubscribed: true,
    }

    if (emailSubject) {
      oneSignalPayload.email_subject = emailSubject
    }
    if (templateId) {
      oneSignalPayload.template_id = templateId
    } else {
      oneSignalPayload.email_body = emailBody
    }

    if (targeting === 'external_id') {
      oneSignalPayload.include_aliases = { external_id: [recipientAuthUserId] }
    } else {
      oneSignalPayload.email_to = [recipientEmail]
    }

    const oneSignalResponse = await fetch(ONESIGNAL_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Key ${oneSignalRestApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(oneSignalPayload),
    })

    const oneSignalResult = await oneSignalResponse.json().catch(() => ({})) as Record<string, unknown>

    if (!oneSignalResponse.ok) {
      const apiErrors = oneSignalResult.errors
      const detail = Array.isArray(apiErrors)
        ? apiErrors.join('; ')
        : String(oneSignalResult.error ?? oneSignalResult.message ?? oneSignalResponse.statusText)
      console.error('onesignal-send-email API:', detail, oneSignalResult)
      return jsonResponse({ error: detail || 'OneSignal rechazó el envío' }, 502)
    }

    return jsonResponse({
      success: true,
      onesignal_id: oneSignalResult.id ?? null,
      recipients: oneSignalResult.recipients ?? null,
      targeting,
      email: recipientEmail || null,
      external_id: recipientAuthUserId || null,
    })
  } catch (err) {
    console.error('onesignal-send-email:', err)
    const message = err instanceof Error ? err.message : 'Error interno'
    return jsonResponse({ error: message }, 500)
  }
})
