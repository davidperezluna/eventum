import { deepEqual, equal, match } from 'node:assert/strict'
import { handleRequest, itemsFromBoletaRows } from './index.ts'

Deno.test('worker rechaza GET y peticiones sin secreto antes de consultar la base', async () => {
  equal((await handleRequest(new Request('https://worker.test'))).status, 405)
  Deno.env.set('TRANSACTIONAL_EMAIL_WORKER_SECRET', 'test-secret')
  try {
    equal((await handleRequest(new Request('https://worker.test', { method: 'POST' }))).status, 401)
    equal((await handleRequest(new Request('https://worker.test', {
      method: 'POST', headers: { 'x-worker-secret': 'wrong' },
    }))).status, 401)
  } finally { Deno.env.delete('TRANSACTIONAL_EMAIL_WORKER_SECRET') }
})

Deno.test('worker apagado no consulta la base ni envía mensajes', async () => {
  Deno.env.set('TRANSACTIONAL_EMAIL_WORKER_SECRET', 'test-secret')
  Deno.env.set('TRANSACTIONAL_EMAIL_ENABLED', 'false')
  try {
    const response = await handleRequest(new Request('https://worker.test', {
      method: 'POST', headers: { 'x-worker-secret': 'test-secret' },
    }))
    equal(response.status, 200)
    equal((await response.json()).enabled, false)
  } finally {
    Deno.env.delete('TRANSACTIONAL_EMAIL_WORKER_SECRET')
    Deno.env.delete('TRANSACTIONAL_EMAIL_ENABLED')
  }
})

Deno.test('palco multipersona cuenta una unidad comercial por grupo', () => {
  deepEqual(itemsFromBoletaRows([
    { tipo_boleta_id: 1, grupo_palco_id: 'g1', consume_inventario: true, tipos_boleta: { nombre: 'Palco' } },
    { tipo_boleta_id: 1, grupo_palco_id: 'g1', consume_inventario: false, tipos_boleta: { nombre: 'Palco' } },
    { tipo_boleta_id: 2, consume_inventario: true, tipos_boleta: { nombre: 'General' } },
    { tipo_boleta_id: 2, consume_inventario: true, tipos_boleta: { nombre: 'General' } },
  ]), [
    { nombre: 'General', cantidad: 2, tipo: 'entrada' },
    { nombre: 'Palco', cantidad: 1, tipo: 'entrada' },
  ])
})

Deno.test('pedido mixto: si falla guardar la aceptación, reintenta el mismo mensaje y UUID', async () => {
  const values: Record<string, string> = {
    TRANSACTIONAL_EMAIL_WORKER_SECRET: 'test-secret', TRANSACTIONAL_EMAIL_ENABLED: 'true',
    ONESIGNAL_APP_ID: 'test-app', ONESIGNAL_REST_API_KEY: 'test-key',
    SUPABASE_URL: 'https://database.test', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    EVENTUM_SITE_URL: 'https://eventum.test',
  }
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, Deno.env.get(key)]))
  for (const [key, value] of Object.entries(values)) Deno.env.set(key, value)
  const originalFetch = globalThis.fetch
  const job: Record<string, any> = {
    id: '34773295-3da3-4833-8053-fb5cb41aa215', tipo: 'compra_confirmada',
    referencia: 'checkout:1', estado: 'pendiente', intentos: 0, mensaje: null,
  }
  const checkout = {
    id: 1, cliente_id: 79, evento_id: 25, tipo: 'mixto', estado: 'aprobada',
    wompi_status: 'APPROVED', materializado: true, compra_id: 10, compra_producto_id: 20,
    numero_intento: 'CHK-1', total: 75000, request_payload: { request_body: {
      pedido_boletas: { items: [{ tipo_boleta_id: 1, cantidad: 2 }] },
      pedido_productos: { items: [{ producto_id: 2, cantidad: 1 }] },
    } },
  }
  let failAcceptedWrite = true
  let userReads = 0
  const notifications: Record<string, any>[] = []
  const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  })
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const body = init?.body ? JSON.parse(String(init.body)) : null
    if (url.hostname === 'api.onesignal.com') {
      notifications.push(body)
      return response({ id: 'same-notification-id' })
    }
    if (url.hostname !== 'database.test') throw new Error('Solicitud externa inesperada en prueba')
    const resource = url.pathname.split('/').pop()
    if (resource === 'tomar_correos_transaccionales') {
      if (job.estado !== 'pendiente') return response([])
      job.estado = 'procesando'; job.intentos++
      return response([structuredClone(job)])
    }
    if (resource === 'limpiar_correos_transaccionales') return response(null)
    if (resource === 'correos_transaccionales') {
      if (body.estado === 'aceptado' && failAcceptedWrite) {
        failAcceptedWrite = false
        return response({ message: 'simulated write failure' }, 500)
      }
      Object.assign(job, body)
      return response({ id: job.id })
    }
    if (resource === 'transacciones_checkout') return response(checkout)
    if (resource === 'compras' || resource === 'compras_productos') {
      return response({ id: 10, cliente_id: 79, estado_pago: 'completado' })
    }
    if (resource === 'usuarios') {
      userReads++
      return response({ nombre: 'Ana', email: 'titular@example.com' })
    }
    if (resource === 'eventos') return response({ titulo: 'Evento', fecha_inicio: '2026-09-06T02:00:00', lugar_id: 1 })
    if (resource === 'lugares') return response({ nombre: 'Club' })
    if (resource === 'tipos_boleta') return response([{ id: 1, nombre: 'General' }])
    if (resource === 'productos') return response([{ id: 2, nombre: 'Agua' }])
    throw new Error(`Recurso inesperado: ${resource}`)
  }) as typeof fetch
  try {
    const invoke = () => handleRequest(new Request('https://worker.test', {
      method: 'POST', headers: { 'x-worker-secret': 'test-secret' },
    }))
    equal((await (await invoke()).json()).failed, 1)
    equal(job.estado, 'pendiente')
    equal((await (await invoke()).json()).accepted, 1)
    equal(job.estado, 'aceptado')
    equal(job.onesignal_id, 'same-notification-id')
    equal(userReads, 1, 'el reintento no cambia destinatario ni contenido')
    equal(notifications.length, 2)
    deepEqual(notifications[0], notifications[1], 'mismo payload y misma clave idempotente')
    deepEqual(notifications[0].email_to, ['titular@example.com'])
    equal(notifications[0].idempotency_key, job.id)
    match(notifications[0].email_body, /2 × General/)
    match(notifications[0].email_body, /1 × Agua/)
    match(notifications[0].email_body, /Entradas/)
    match(notifications[0].email_body, /Productos/)
    match(notifications[0].email_body, /Total pagado:/)
    equal((await (await invoke()).json()).accepted, 0)
    equal(notifications.length, 2, 'el aceptado no se vuelve a enviar')
  } finally {
    globalThis.fetch = originalFetch
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) Deno.env.delete(key)
      else Deno.env.set(key, value)
    }
  }
})

Deno.test('venta manual: arma el correo desde compra y boletas sin checkout', async () => {
  const values: Record<string, string> = {
    TRANSACTIONAL_EMAIL_WORKER_SECRET: 'test-secret', TRANSACTIONAL_EMAIL_ENABLED: 'true',
    ONESIGNAL_APP_ID: 'test-app', ONESIGNAL_REST_API_KEY: 'test-key',
    SUPABASE_URL: 'https://database.test', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    EVENTUM_SITE_URL: 'https://eventum.test',
  }
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, Deno.env.get(key)]))
  for (const [key, value] of Object.entries(values)) Deno.env.set(key, value)
  const originalFetch = globalThis.fetch
  const job: Record<string, any> = {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', tipo: 'compra_confirmada',
    referencia: 'compra:10', estado: 'pendiente', intentos: 0, mensaje: null,
  }
  const notifications: Record<string, any>[] = []
  const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  })
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const body = init?.body ? JSON.parse(String(init.body)) : null
    if (url.hostname === 'api.onesignal.com') {
      notifications.push(body)
      return response({ id: 'manual-notification-id' })
    }
    if (url.hostname !== 'database.test') throw new Error('Solicitud externa inesperada en prueba')
    const resource = url.pathname.split('/').pop()
    if (resource === 'tomar_correos_transaccionales') {
      if (job.estado !== 'pendiente') return response([])
      job.estado = 'procesando'; job.intentos++
      return response([structuredClone(job)])
    }
    if (resource === 'limpiar_correos_transaccionales') return response(null)
    if (resource === 'correos_transaccionales') {
      Object.assign(job, body)
      return response({ id: job.id })
    }
    if (resource === 'compras') {
      return response({
        id: 10, cliente_id: 79, evento_id: 25, estado_pago: 'completado', total: 0,
        numero_transaccion: 'TXN-MANUAL-10',
        datos_facturacion: { origen: 'admin_manual', creado_desde: 'ventas_manual' },
      })
    }
    if (resource === 'boletas_compradas') {
      return response([
        { tipo_boleta_id: 1, grupo_palco_id: null, consume_inventario: true, tipos_boleta: { nombre: 'General' } },
        { tipo_boleta_id: 1, grupo_palco_id: null, consume_inventario: true, tipos_boleta: { nombre: 'General' } },
      ])
    }
    if (resource === 'usuarios') return response({ nombre: 'Luis', email: 'luis@example.com' })
    if (resource === 'eventos') return response({ titulo: 'Fiesta', fecha_inicio: '2026-09-06T02:00:00', lugar_id: 1 })
    if (resource === 'lugares') return response({ nombre: 'Club' })
    throw new Error(`Recurso inesperado: ${resource}`)
  }) as typeof fetch
  try {
    const result = await (await handleRequest(new Request('https://worker.test', {
      method: 'POST', headers: { 'x-worker-secret': 'test-secret' },
    }))).json()
    equal(result.accepted, 1)
    equal(job.estado, 'aceptado')
    equal(notifications.length, 1)
    deepEqual(notifications[0].email_to, ['luis@example.com'])
    match(notifications[0].email_body, /2 × General/)
    match(notifications[0].email_body, /quedó registrada en Eventum/)
    match(notifications[0].email_body, /TXN-MANUAL-10/)
    equal(notifications[0].email_body.includes('Total pagado:'), false)
    equal(notifications[0].email_body.includes('Total:'), false)
    equal(notifications[0].email_body.includes('$'), false)
    match(notifications[0].email_body, /mis-compras\/evento\/25/)
  } finally {
    globalThis.fetch = originalFetch
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) Deno.env.delete(key)
      else Deno.env.set(key, value)
    }
  }
})
