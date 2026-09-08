import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.86.2'

export interface ConfirmationEmailData {
  nombre: string
  email: string
  titulo: string
  fechaInicio?: string | null
  lugar?: string | null
  referencia: string
  enlace: string
  tieneBoletas: boolean
  total: number
  items: Array<{ nombre: string; cantidad: number; tipo: 'entrada' | 'producto' | 'cover' }>
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]!)
}

/** Los timestamps sin offset de Eventum están guardados en UTC. */
export function fechaColombia(value: string): string {
  const normalized = value.trim().replace(' ', 'T')
  const date = new Date(/(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(normalized)
    ? normalized : `${normalized}Z`)
  if (Number.isNaN(date.getTime())) throw new Error('Fecha del evento inválida')
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota', dateStyle: 'long', timeStyle: 'short',
  }).format(date)
}

export function buildConfirmationEmail(data: ConfirmationEmailData): {
  email_subject: string; email_body: string; email_preheader: string
} {
  const e = escapeHtml
  const link = new URL(data.enlace)
  if (link.protocol !== 'https:') throw new Error('El enlace de compra debe usar HTTPS')
  if (!Number.isFinite(data.total) || data.total < 0) throw new Error('Total de compra inválido')
  const groups = [
    { tipo: 'entrada', titulo: 'Entradas' },
    { tipo: 'producto', titulo: 'Productos' },
    { tipo: 'cover', titulo: 'Covers' },
  ] as const
  const itemGroups = groups.map((group) => {
    const rows = data.items.filter((item) => item.tipo === group.tipo).map((item) =>
      `<li style="margin:8px 0">${item.cantidad} × ${e(item.nombre)}</li>`).join('')
    return rows
      ? `<h3 style="font-size:15px;margin:20px 0 6px">${group.titulo}</h3><ul style="margin:0;padding-left:20px">${rows}</ul>`
      : ''
  }).join('')
  const total = new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
  }).format(data.total)
  // Evita que clientes de correo conviertan automáticamente la cuenta en un enlace azul.
  const displayEmail = e(data.email).replaceAll('@', '&#64;').replaceAll('.', '&#46;')
  const fecha = data.fechaInicio ? fechaColombia(data.fechaInicio) : null
  const qr = data.tieneBoletas
    ? '<p style="padding:16px;background:#f3efff;border-radius:8px"><strong>Los códigos QR se habilitan el día del evento.</strong> Consúltalos en Mis compras; este correo confirma tu compra y no reemplaza la entrada.</p>'
    : '<p>Consulta los detalles y las condiciones de uso de tu compra en Eventum.</p>'
  return {
    email_subject: `Tu compra para ${data.titulo.replace(/[\r\n]+/g, ' ')} está confirmada`,
    email_preheader: 'Recibimos tu pago. Consulta tu compra en Eventum.',
    email_body: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;background:#f6f5f8;font-family:Arial,sans-serif;color:#25212d">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:white;border-radius:12px"><tr><td style="padding:28px">
<p style="color:#7045c5;font-weight:bold;letter-spacing:2px">EVENTUM</p>
<h1 style="font-size:26px;line-height:1.2">Tu compra está confirmada</h1>
<p>Hola${data.nombre ? `, ${e(data.nombre)}` : ''}:</p><p>Recibimos tu pago y tu compra quedó registrada.</p>
<h2 style="font-size:21px">${e(data.titulo)}</h2>
${fecha ? `<p><strong>Fecha y hora:</strong> ${e(fecha)} (hora de Colombia)</p>` : ''}
${data.lugar ? `<p><strong>Lugar:</strong> ${e(data.lugar)}</p>` : ''}
${itemGroups}
<p style="margin:22px 0;font-size:18px"><strong>Total pagado:</strong> ${e(total)}</p>
${qr}
<p style="margin:28px 0"><a href="${e(link.href)}" style="display:inline-block;padding:15px 24px;background:#7045c5;color:white;text-decoration:none;border-radius:8px;font-weight:bold">Ver mi compra</a></p>
<p style="margin-bottom:6px">Ingresa con la misma cuenta que utilizaste para comprar:</p>
<p style="margin-top:0"><strong style="color:#25212d;text-decoration:none">${displayEmail}</strong></p>
<p style="font-size:13px;color:#655f70">Referencia de compra: ${e(data.referencia)}</p>
<p style="font-size:13px;color:#655f70">Si el botón no abre, visita <a href="${e(link.href)}">Mis compras en Eventum</a>.</p>
</td></tr></table></td></tr></table></body></html>`,
  }
}

export function retryAt(attempt: number, now = Date.now()): string {
  const minutes = [1, 5, 15, 60, 180, 360, 720]
  return new Date(now + minutes[Math.min(Math.max(attempt - 1, 0), minutes.length - 1)] * 60_000).toISOString()
}

export function oneSignalMessageId(response: { ok: boolean; status: number }, body: unknown): string {
  const result = body as { id?: unknown } | null
  if (!response.ok) throw new Error(`OneSignal HTTP ${response.status}`)
  if (typeof result?.id !== 'string' || !result.id.trim()) {
    throw new Error('OneSignal no creó el mensaje (respuesta sin id)')
  }
  return result.id
}

type Client = SupabaseClient
type Row = Record<string, any>
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
})

async function single(db: Client, table: string, id: number, fields = '*'): Promise<Row> {
  const { data, error } = await db.from(table).select(fields).eq('id', id).single()
  if (error || !data) throw new Error(`No se pudo cargar ${table}`)
  return data as Row
}

async function prepareMessage(db: Client, job: Row, appId: string, siteUrl: string): Promise<Row> {
  const match = /^checkout:(\d+)$/.exec(job.referencia)
  if (job.tipo !== 'compra_confirmada' || !match) throw new Error('Tipo o referencia no soportados')
  const checkout = await single(db, 'transacciones_checkout', Number(match[1]))
  if (checkout.estado !== 'aprobada' || checkout.wompi_status !== 'APPROVED' || !checkout.materializado) {
    throw new Error('El pedido no tiene un pago aprobado y registrado')
  }
  const expected: Record<string, string[]> = {
    boletas: ['compra_id'], productos: ['compra_producto_id'], mixto: ['compra_id', 'compra_producto_id'],
    cover: ['compra_cover_id'], cover_mixto: ['compra_cover_id', 'compra_producto_id'],
  }
  const fields = expected[checkout.tipo]
  if (!fields || fields.some((key) => !checkout[key])) throw new Error('Pedido incompleto')
  const tables: Record<string, string> = {
    compra_id: 'compras', compra_producto_id: 'compras_productos', compra_cover_id: 'compras_cover',
  }
  for (const key of fields) {
    const purchase = await single(db, tables[key], checkout[key], 'id, cliente_id, estado_pago')
    if (Number(purchase.cliente_id) !== Number(checkout.cliente_id) || purchase.estado_pago !== 'completado') {
      throw new Error('La compra no está confirmada para el titular del pedido')
    }
  }
  const user = await single(db, 'usuarios', checkout.cliente_id, 'email, nombre')
  const email = String(user.email ?? '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('La cuenta no tiene correo válido')
  const event = checkout.evento_id ? await single(db, 'eventos', checkout.evento_id, 'titulo, fecha_inicio, lugar_id') : null
  const lugarId = event?.lugar_id ?? checkout.lugar_id
  const venue = lugarId ? await single(db, 'lugares', lugarId, 'nombre') : null
  const items: ConfirmationEmailData['items'] = []
  const payload = checkout.request_payload ?? {}
  const source = payload.request_body ?? payload
  for (const [key, table, idKey] of [
    ['pedido_boletas', 'tipos_boleta', 'tipo_boleta_id'],
    ['pedido_productos', 'productos', 'producto_id'],
    ['pedido_covers', 'tipos_cover', 'tipo_cover_id'],
  ]) {
    const lines = (source[key] ?? payload[key])?.items
    if (!Array.isArray(lines) || !lines.length) continue
    const ids = [...new Set(lines.map((line: Row) => Number(line[idKey])))]
    const { data: names, error } = await db.from(table).select('id, nombre').in('id', ids)
    if (error) throw new Error('No se pudo cargar el detalle del pedido')
    for (const line of lines) {
      const name = names?.find((item: Row) => Number(item.id) === Number(line[idKey]))?.nombre
      const quantity = Number(line.cantidad)
      if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Cantidad del pedido inválida')
      const tipo = key === 'pedido_productos' ? 'producto' : key === 'pedido_covers' ? 'cover' : 'entrada'
      items.push({
        nombre: String(name ?? (tipo === 'producto' ? 'Producto' : tipo === 'cover' ? 'Cover' : 'Entrada')),
        cantidad: quantity,
        tipo,
      })
    }
  }
  const path = event ? `/mis-compras/evento/${checkout.evento_id}`
    : lugarId ? `/mis-compras/club/${lugarId}` : '/mis-compras'
  const content = buildConfirmationEmail({
    nombre: String(user.nombre ?? ''), email,
    titulo: String(event?.titulo ?? venue?.nombre ?? 'Tu experiencia en Eventum'),
    fechaInicio: event?.fecha_inicio, lugar: venue?.nombre,
    referencia: String(checkout.numero_intento), enlace: new URL(path, siteUrl).href,
    tieneBoletas: !!checkout.compra_id, total: Number(checkout.total), items,
  })
  return {
    app_id: appId, target_channel: 'email', email_to: [email],
    include_unsubscribed: true, idempotency_key: job.id, ...content,
  }
}

// El cron usa un secreto exclusivo. Nunca se invoca desde el navegador del cliente.
export async function handleRequest(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
  const token = Deno.env.get('TRANSACTIONAL_EMAIL_WORKER_SECRET')
  if (!token || req.headers.get('x-worker-secret') !== token) return json({ error: 'No autorizado' }, 401)
  // Activación explícita tras desplegar SQL, función y cron.
  if (Deno.env.get('TRANSACTIONAL_EMAIL_ENABLED') !== 'true') return json({ enabled: false })
  const appId = Deno.env.get('ONESIGNAL_APP_ID')
  const apiKey = Deno.env.get('ONESIGNAL_REST_API_KEY')
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const siteUrl = Deno.env.get('EVENTUM_SITE_URL')
  if (!appId || !apiKey || !url || !serviceKey || !siteUrl) return json({ error: 'Configuración incompleta' }, 503)
  try {
    if (new URL(siteUrl).protocol !== 'https:') return json({ error: 'EVENTUM_SITE_URL debe usar HTTPS' }, 503)
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: jobs, error } = await db.rpc('tomar_correos_transaccionales', { p_limite: 5 })
    if (error) throw new Error('No se pudo tomar la cola de correos')
    let accepted = 0
    let failed = 0
    for (const job of (jobs ?? []) as Row[]) {
      // El número de intento actúa como versión del bloqueo: un worker viejo no pisa al nuevo.
      const save = async (values: Row) => {
        const { data, error } = await db.from('correos_transaccionales').update(values)
          .eq('id', job.id).eq('estado', 'procesando').eq('intentos', job.intentos).select('id').single()
        if (error || !data) throw new Error('No se pudo guardar el estado del correo')
      }
      try {
        let message = job.mensaje
        if (!message) {
          message = await prepareMessage(db, job, appId, siteUrl)
          await save({ mensaje: message })
        }
        if (message.app_id !== appId) throw new Error('La app OneSignal cambió desde el primer intento')
        const response = await fetch('https://api.onesignal.com/notifications?c=email', {
          method: 'POST', headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(message), signal: AbortSignal.timeout(15_000),
        })
        const result = await response.json().catch(() => null)
        const messageId = oneSignalMessageId(response, result)
        await save({ estado: 'aceptado', onesignal_id: messageId, aceptado_at: new Date().toISOString(), bloqueo_hasta: null, ultimo_error: null })
        accepted++
      } catch (error) {
        failed++
        // No se guardan respuestas del proveedor que puedan contener datos personales.
        const detail = error instanceof Error ? error.message : 'Error de envío'
        await save({
          estado: job.intentos >= 8 ? 'fallido' : 'pendiente', bloqueo_hasta: null,
          proximo_intento_at: retryAt(job.intentos), ultimo_error: detail.slice(0, 300),
        })
      }
    }
    const { error: cleanupError } = await db.rpc('limpiar_correos_transaccionales')
    if (cleanupError) console.error('No se pudo limpiar el contenido de correos antiguos')
    return json({ accepted, failed })
  } catch {
    return json({ error: 'No se pudo completar el procesamiento; los bloqueos vencen automáticamente' }, 500)
  }
}

if (import.meta.main) Deno.serve(handleRequest)
