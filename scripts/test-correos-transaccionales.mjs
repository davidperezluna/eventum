// PostgreSQL aislado en memoria; nunca conecta con Supabase.
// EMAIL_SQL_TEST_MODULE permite usar PGlite instalado fuera del proyecto.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.EMAIL_SQL_TEST_MODULE || '@electric-sql/pglite');
const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.transacciones_checkout (
      id bigint primary key, wompi_status text, estado text, materializado boolean default false,
      total numeric default 100, compra_id bigint, compra_producto_id bigint, compra_cover_id bigint
    );
    insert into public.transacciones_checkout values (99, 'APPROVED', 'aprobada', true, 100, 99, null, null);
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20260907235750_correos_transaccionales.sql', import.meta.url), 'utf8'));
  const count = async () => Number((await db.query('select count(*) from public.correos_transaccionales')).rows[0].count);
  await db.exec(`
    insert into public.transacciones_checkout values
      (1, 'PENDING', 'pendiente', false, 100, null, null, null),
      (2, 'DECLINED', 'rechazada', false, 100, null, null, null),
      (3, 'APPROVED', 'aprobada', true, 0, 3, null, null),
      (4, 'APPROVED', 'aprobada', false, 100, 4, null, null);
    update public.transacciones_checkout set total = 101 where id = 99;
  `);
  assert.equal(await count(), 0, 'no pendientes, rechazados, gratis, incompletos ni históricos');
  await db.exec("update public.transacciones_checkout set wompi_status='APPROVED', estado='aprobada', materializado=true, compra_id=1, compra_producto_id=1 where id=1");
  assert.equal(await count(), 1, 'un solo correo en pedido mixto');
  await db.exec("update public.transacciones_checkout set total=102 where id=1");
  assert.equal(await count(), 1, 'callback repetido no duplica');
  const first = (await db.query('select * from public.tomar_correos_transaccionales(5)')).rows;
  assert.equal(first.length, 1);
  assert.equal(first[0].intentos, 1);
  assert.equal((await db.query('select * from public.tomar_correos_transaccionales(5)')).rows.length, 0, 'otro worker no toma trabajo bloqueado');
  await db.exec("update public.correos_transaccionales set bloqueo_hasta=now()-interval '1 minute'");
  const recovered = (await db.query('select * from public.tomar_correos_transaccionales(5)')).rows[0];
  assert.equal(recovered.id, first[0].id, 'reintento conserva UUID para OneSignal');
  assert.equal(recovered.intentos, 2);
  const stale = await db.query("update public.correos_transaccionales set estado='aceptado' where id=$1 and intentos=1 returning id", [first[0].id]);
  assert.equal(stale.rows.length, 0, 'worker antiguo no sobrescribe nuevo intento');
  await db.exec("update public.correos_transaccionales set estado='pendiente', proximo_intento_at=now()+interval '1 hour'");
  assert.equal((await db.query('select * from public.tomar_correos_transaccionales(5)')).rows.length, 0, 'respeta backoff');
  await db.exec("update public.correos_transaccionales set estado='procesando', intentos=8, bloqueo_hasta=now()-interval '1 minute'");
  await db.query('select * from public.tomar_correos_transaccionales(5)');
  assert.equal((await db.query('select estado from public.correos_transaccionales')).rows[0].estado, 'fallido');
  await db.exec("update public.correos_transaccionales set estado='pendiente', intentos=1, primer_intento_at=now()-interval '28 days', bloqueo_hasta=null");
  assert.equal((await db.query('select * from public.tomar_correos_transaccionales(5)')).rows.length, 0, 'no reenvía fuera de ventana idempotente');
  await db.exec(`update public.correos_transaccionales set estado='aceptado', aceptado_at=now()-interval '31 days', mensaje='{"email_to":["test@example.com"]}', onesignal_id='accepted-id'`);
  await db.query('select public.limpiar_correos_transaccionales()');
  const cleaned = (await db.query('select * from public.correos_transaccionales')).rows[0];
  assert.equal(cleaned.mensaje, null);
  assert.equal(cleaned.onesignal_id, 'accepted-id');
  assert.equal(await count(), 1, 'limpieza conserva deduplicación');
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query('select * from public.correos_transaccionales'));
    await assert.rejects(db.query('select * from public.tomar_correos_transaccionales(1)'));
    await assert.rejects(db.query('select public.limpiar_correos_transaccionales()'));
    await db.exec('reset role');
  }
  await db.exec("set role service_role");
  assert.equal((await db.query('select * from public.correos_transaccionales')).rows.length, 1);
  await db.exec('reset role');
  await db.exec(`
    create table public.compras (
      id bigint primary key,
      estado_pago text not null default 'pendiente',
      datos_facturacion jsonb
    );
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20260908001500_correo_compra_manual.sql', import.meta.url), 'utf8'));
  await db.exec(`
    insert into public.compras values
      (1, 'pendiente', '{"origen":"admin_manual","creado_desde":"ventas_manual"}'::jsonb),
      (2, 'pendiente', '{}'::jsonb),
      (3, 'pendiente', '{"creado_desde":"carrito"}'::jsonb);
  `);
  await db.exec("update public.compras set estado_pago='completado' where id=2");
  assert.equal(await count(), 1, 'cupón/carrito sin marcador manual no encola');
  await db.exec("update public.compras set estado_pago='completado' where id=3");
  assert.equal(await count(), 1, 'creado_desde carrito no encola');
  await db.exec("update public.compras set estado_pago='completado' where id=1");
  assert.equal(await count(), 2, 'venta manual encola un correo');
  const manual = (await db.query("select referencia from public.correos_transaccionales where referencia like 'compra:%'")).rows[0];
  assert.equal(manual.referencia, 'compra:1');
  await db.exec("update public.compras set datos_facturacion = datos_facturacion || '{\"nota\":\"x\"}'::jsonb where id=1");
  assert.equal(await count(), 2, 'update posterior no duplica');
  console.log('PASS: cola, deduplicación, bloqueo, recuperación, backoff, límites, limpieza, permisos y venta manual');
} finally {
  await db.close();
}
