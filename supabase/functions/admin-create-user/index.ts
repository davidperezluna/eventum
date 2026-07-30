import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ADMIN_TIPO_USUARIO_ID = 3

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

type AdminSupabaseClient = ReturnType<typeof createClient>

async function upsertUsuarioPerfil(
  adminClient: AdminSupabaseClient,
  usuarioPayload: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const authUserId = String(usuarioPayload.auth_user_id || '')
  if (!authUserId) return null

  const { data: existing, error: existingError } = await adminClient
    .from('usuarios')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  if (existingError) {
    console.error('admin-create-user lookup usuarios:', existingError.message)
    return null
  }

  if (existing?.id) {
    const { auth_user_id: _authUserId, ...updateFields } = usuarioPayload
    const { data, error } = await adminClient
      .from('usuarios')
      .update(updateFields)
      .eq('id', existing.id)
      .select()
      .single()

    if (error) {
      console.error('admin-create-user update usuarios:', error.message)
      return null
    }
    return data as Record<string, unknown>
  }

  const { data, error } = await adminClient
    .from('usuarios')
    .insert(usuarioPayload)
    .select()
    .single()

  if (error) {
    // Carrera con trigger: reintentar como update si ya existe auth_user_id.
    if (String(error.message || '').includes('usuarios_auth_user_id_key')) {
      const { data: retryExisting } = await adminClient
        .from('usuarios')
        .select('id')
        .eq('auth_user_id', authUserId)
        .maybeSingle()

      if (retryExisting?.id) {
        const { auth_user_id: _authUserId, ...updateFields } = usuarioPayload
        const { data: updated, error: updateError } = await adminClient
          .from('usuarios')
          .update(updateFields)
          .eq('id', retryExisting.id)
          .select()
          .single()

        if (!updateError && updated) {
          return updated as Record<string, unknown>
        }
      }
    }
    console.error('admin-create-user insert usuarios:', error.message)
    return null
  }

  return data as Record<string, unknown>
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase no configurado en la Edge Function')
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
      console.error('admin-create-user auth.getUser:', callerAuthError?.message)
      return jsonResponse({ error: 'Sesión inválida o expirada. Vuelve a iniciar sesión.' }, 401)
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
      return jsonResponse({ error: 'Solo administradores pueden crear usuarios' }, 403)
    }

    const body = await req.json() as {
      email?: string
      password?: string
      nombre?: string
      apellido?: string
      tipo_usuario_id?: number
      telefono?: string
      activo?: boolean
    }

    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    const tipoUsuarioId = Number(body.tipo_usuario_id)

    if (!email || !password || !Number.isFinite(tipoUsuarioId) || tipoUsuarioId <= 0) {
      return jsonResponse({ error: 'email, password y tipo_usuario_id son requeridos' }, 400)
    }

    if (password.length < 6) {
      return jsonResponse({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400)
    }

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        nombre: body.nombre || '',
        apellido: body.apellido || '',
      },
    })

    if (authError || !authData?.user) {
      const message = authError?.message || 'Error al crear usuario en Auth'
      return jsonResponse({ error: message }, 400)
    }

    const authUserId = authData.user.id

    const usuarioPayload = {
      email,
      nombre: body.nombre?.trim() || null,
      apellido: body.apellido?.trim() || null,
      telefono: body.telefono?.trim() || null,
      tipo_usuario_id: tipoUsuarioId,
      activo: body.activo !== false,
      email_verificado: true,
      auth_user_id: authUserId,
      fecha_actualizacion: new Date().toISOString(),
    }

    // El trigger on auth.users puede crear la fila como "cliente" antes que lleguemos aquí.
    // Upsert por auth_user_id: actualiza tipo/nombre/etc. o inserta si el trigger no corrió.
    let saved = await upsertUsuarioPerfil(adminClient, usuarioPayload)

    if (!saved) {
      await new Promise((resolve) => setTimeout(resolve, 150))
      saved = await upsertUsuarioPerfil(adminClient, usuarioPayload)
    }

    if (!saved) {
      await adminClient.auth.admin.deleteUser(authUserId)
      return jsonResponse(
        { error: 'No se pudo guardar el perfil en usuarios tras crear la cuenta' },
        400,
      )
    }

    return jsonResponse({ success: true, usuario: saved })
  } catch (error) {
    console.error('admin-create-user error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return jsonResponse({ error: message }, 500)
  }
})
