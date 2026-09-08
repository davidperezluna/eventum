# Correo de compra confirmada — despliegue manual

Implementado en `dev`. Estos archivos NO modifican Supabase hasta que los despliegues.
No se enviaron correos reales durante las pruebas.

## Qué hace

- Un correo por checkout pagado, aprobado y completamente registrado. Boletas y productos de un pedido mixto van juntos.
- Envía al correo del titular de la compra (`usuarios.email`), nunca al correo escrito en Wompi ni al de otro carrito.
- Incluye evento, fecha y hora de Colombia, lugar, selección y enlace a `/mis-compras/evento/:id`. El usuario debe ingresar con la cuenta de compra.
- No adjunta ni genera QR. Para boletas explica que se habilitan el día del evento. Productos y covers tienen un texto distinto sin esa promesa.
- No envía correos de pagos pendientes, rechazados, compras gratuitas del carrito (cupón 100%) ni compras históricas ya confirmadas. Los flujos antiguos sin `transacciones_checkout` quedan fuera, salvo **venta manual** de boletas (`ventas-manual` / modal admin), que encola con referencia `compra:{id}`.
- La tabla es reutilizable por otros tipos de correo. Solo está implementado `compra_confirmada` (checkout online y venta manual de entradas).
## 1. Base de datos

Ejecuta **solo** `supabase/migrations/20260907235750_correos_transaccionales.sql` en el SQL Editor del proyecto de destino. No ejecutes todas las migraciones históricas.

Requiere la tabla `transacciones_checkout` actual, incluido `compra_cover_id`. La migración crea:

- `correos_transaccionales`, con RLS y acceso solo para `service_role`.
- Un trigger que registra el correo en la misma operación que confirma el checkout.
- Funciones para tomar trabajo sin colisiones y limpiar contenido antiguo.

Después, ejecuta también `supabase/migrations/20260908001500_correo_compra_manual.sql` (trigger en `compras` para ventas manuales).

No hace backfill. Los pagos nuevos que se confirmen después de instalar el trigger quedan pendientes hasta activar el worker. Desplegar pronto los siguientes pasos evita acumular una cola antes de empezar.

## 2. Secrets de Edge Functions

Reutiliza `ONESIGNAL_APP_ID` y `ONESIGNAL_REST_API_KEY` existentes. Supabase proporciona `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.

Añade en el panel:

- `EVENTUM_SITE_URL`: origen HTTPS publicado, por ejemplo `https://www.eventumcol.com`.
- `TRANSACTIONAL_EMAIL_WORKER_SECRET`: un secreto largo, aleatorio y exclusivo para este worker. No usar una clave pública ni guardar el valor en Git.
- `TRANSACTIONAL_EMAIL_ENABLED`: inicialmente `false`.

El remitente/dominio de Email en OneSignal debe seguir configurado igual que para los correos de prueba. El cuerpo HTML viene del código, no requiere crear una plantilla en OneSignal.

## 3. Subir las funciones

### Opción simple: editor web de Supabase

En Edge Functions crea `transactional-email-worker`, reemplaza el ejemplo completo por el contenido de `supabase/functions/transactional-email-worker/index.ts` y despliega. El archivo es autocontenido: incluye el HTML y no requiere copiar dependencias locales.

Actualiza también `wompi-webhook` con el archivo local correspondiente, conservando su configuración para recibir webhooks sin validación JWT de usuario.

### Opción CLI

Desde la raíz del repositorio, sustituye `PROJECT_REF` por el proyecto correcto:

```powershell
supabase functions deploy transactional-email-worker --project-ref PROJECT_REF --no-verify-jwt --use-api
supabase functions deploy wompi-webhook --project-ref PROJECT_REF --no-verify-jwt --use-api
```

El worker usa autenticación propia mediante `x-worker-secret` y rechaza peticiones sin el secreto. No lo llames desde Angular. El webhook conserva su validación de Wompi; el único cambio es propagar errores al guardar el checkout para que Wompi reintente en lugar de perder el registro del correo.

Los cambios posteriores al diseño del correo se hacen en el mismo `index.ts` y requieren volver a desplegar `transactional-email-worker`.

## 4. Programar envíos y reintentos

En **Vault**, crea estos secretos (son distintos del listado de Edge Functions):

- `eventum_project_url`: URL del proyecto Supabase, sin `/` final.
- `eventum_email_worker_secret`: exactamente el mismo valor de `TRANSACTIONAL_EMAIL_WORKER_SECRET`.

Ejecuta `supabase/manual/activar-cron-correos.sql`. Programa una ejecución cada minuto, hasta cinco correos por ejecución. No guarda secretos en el texto del cron. Activar el worker cambiando `TRANSACTIONAL_EMAIL_ENABLED` a `true` permite enviar los pendientes.

Primero prueba en tu entorno de pruebas con OneSignal y una cuenta de prueba. En producción, activar el flag autoriza el envío a los destinatarios de todos los registros pendientes.

## 5. Verificación después del despliegue

Confirma una compra nueva de prueba. Debe aparecer un registro, pasar a `aceptado` y tener `onesignal_id`. Ese estado significa **aceptado por OneSignal**, no garantiza llegada a la bandeja: comprueba también la entrega en OneSignal y en el buzón de prueba.

```sql
select id, tipo, referencia, estado, intentos, onesignal_id, ultimo_error,
       creado_at, aceptado_at
from public.correos_transaccionales
order by creado_at desc
limit 30;
```

Verifica que el botón conserva el destino al iniciar sesión y abre el evento correcto. Repetir un callback del mismo pedido no debe crear otro registro. Un pedido mixto debe generar solo un correo.

## Reintentos, limpieza y pausa

Se reutilizan el UUID y el mensaje congelado en cada reintento. OneSignal usa ese UUID como `idempotency_key`. Un HTTP 200 sin `id` no se considera enviado.

Hasta ocho intentos, con esperas de 1, 5, 15, 60, 180, 360 y 720 minutos. Una ejecución interrumpida libera el registro después de cinco minutos. No se reintenta automáticamente después de 27 días desde el primer intento, para permanecer dentro de la ventana de deduplicación de OneSignal (30 días).

Los fallidos quedan para revisión. No borres su fila ni generes una clave nueva para reintentar un envío de resultado incierto. Antes de un reenvío manual comprueba OneSignal, especialmente si ya pasó la ventana de deduplicación.

La limpieza borra HTML, destinatario y detalles del error de los aceptados después de 30 días, conservando referencia, UUID, estado e identificador de OneSignal. No borra compras ni la constancia que evita duplicados. Los fallidos se conservan para diagnóstico.

Para pausar, establece `TRANSACTIONAL_EMAIL_ENABLED=false`. Las compras siguen registrándose y los correos se acumulan en la cola. El envío HTTP a OneSignal nunca forma parte del procesamiento del pago.

## Pruebas locales

```powershell
npx --yes deno test --allow-env supabase/functions/_shared/compra-confirmada-email_test.ts supabase/functions/transactional-email-worker/index_test.ts
npx --yes deno check supabase/functions/transactional-email-worker/index.ts
npm install --prefix "$env:TEMP/eventum-email-sql-tests" --no-save --package-lock=false @electric-sql/pglite
$env:EMAIL_SQL_TEST_MODULE = ([System.Uri]::new((Join-Path $env:TEMP 'eventum-email-sql-tests/node_modules/@electric-sql/pglite/dist/index.js'))).AbsoluteUri
node scripts/test-correos-transaccionales.mjs
```

La prueba SQL usa PostgreSQL en memoria; no se conecta a Supabase. Comprueba filtros de elegibilidad, duplicados, exclusión entre workers, recuperación, backoff, límites, limpieza y permisos.

Referencias: [OneSignal Email](https://documentation.onesignal.com/reference/email), [idempotencia](https://documentation.onesignal.com/reference/idempotent-notification-requests), [programar Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions).
