import { deepEqual, equal, match, throws } from 'node:assert/strict'
import { buildConfirmationEmail, escapeHtml, fechaColombia, oneSignalMessageId, retryAt } from '../transactional-email-worker/index.ts'

const compra = {
  nombre: 'Ana', email: 'ana@example.com', titulo: 'Oveja Negra',
  fechaInicio: '2026-09-06T02:00:00', lugar: 'Plaza Norte', referencia: 'CHK-123',
  enlace: 'https://www.eventumcol.com/mis-compras/evento/25', tieneBoletas: true,
  items: [{ nombre: 'General', cantidad: 2 }],
}

Deno.test('fecha UTC sin offset se muestra el 5 de septiembre en Colombia', () => {
  match(fechaColombia(compra.fechaInicio), /5 de septiembre de 2026/)
  equal(fechaColombia(compra.fechaInicio), fechaColombia('2026-09-06 02:00:00.000'))
  equal(fechaColombia(compra.fechaInicio), fechaColombia('2026-09-05T21:00:00-05:00'))
  throws(() => fechaColombia('fecha incorrecta'))
})

Deno.test('confirmación sin QR, con cuenta, cantidades y enlace directo al evento', () => {
  const message = buildConfirmationEmail(compra)
  match(message.email_body, /2 × General/)
  match(message.email_body, /ana@example.com/)
  match(message.email_body, /mis-compras\/evento\/25/)
  match(message.email_body, /se habilitan el día del evento/)
  equal(message.email_body.includes('<img'), false)
  equal(message.email_body.includes('data:image'), false)
})

Deno.test('productos y covers no prometen QR de evento', () => {
  const message = buildConfirmationEmail({ ...compra, tieneBoletas: false, fechaInicio: null })
  equal(message.email_body.includes('se habilitan el día'), false)
})

Deno.test('contenido de evento y comprador escapado; no permite enlaces inseguros', () => {
  const message = buildConfirmationEmail({ ...compra, nombre: '<script>alert(1)</script>', titulo: 'A & B\r\nEvento' })
  equal(message.email_body.includes('<script>'), false)
  match(message.email_body, /&lt;script&gt;/)
  equal(message.email_subject.includes('\n'), false)
  equal(escapeHtml('"<&'), '&quot;&lt;&amp;')
  throws(() => buildConfirmationEmail({ ...compra, enlace: 'javascript:alert(1)' }))
})

Deno.test('OneSignal HTTP 200 sin mensaje no cuenta como aceptación', () => {
  throws(() => oneSignalMessageId({ ok: true, status: 200 }, { id: '' }))
  throws(() => oneSignalMessageId({ ok: true, status: 200 }, null))
  throws(() => oneSignalMessageId({ ok: false, status: 429 }, { id: 'id' }))
  equal(oneSignalMessageId({ ok: true, status: 200 }, { id: 'notification-id' }), 'notification-id')
})

Deno.test('reintentos espaciados sin bucle inmediato', () => {
  const now = Date.parse('2026-09-07T12:00:00Z')
  deepEqual([1, 2, 3, 8].map((n) => (Date.parse(retryAt(n, now)) - now) / 60_000), [1, 5, 15, 720])
})
