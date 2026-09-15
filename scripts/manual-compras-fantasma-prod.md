# Manual: pasar Compras fantasma a PROD (BD)

Proyecto destino: **Eventum producción**  
Supabase URL: `https://jiknhvnaavhfguqfqbod.supabase.co`

Referencia ya aplicada en DEV: `modctxrsohemzlzlvlih` (Eventum-dev).

---

## Qué cambia en BD

| Orden | Archivo | Qué hace |
|------:|---------|----------|
| 1 | `supabase/migrations/20260915145642_compras_fantasma_boletas_compartidas.sql` | Schema `fantasma_private`, tabla `compras_fantasma`, columna `boletas_compradas.compra_fantasma_id`, RLS, RPCs `crear_compra_fantasma` / `anular_compra_fantasma`, compatibilidad de traslados/notificaciones |
| 2 | `supabase/migrations/20260915153000_compras_fantasma_escaneo_lector.sql` | Lectura/escaneo alineado con boletas normales (admin/lector/organizador ven; validación admin o lector) |

**Importante:** aplicar **en ese orden**. La 2 asume que la 1 ya corrió.

---

## Antes de tocar PROD

1. Confirmar que PROD ya tiene helpers RLS usados por el módulo:
   - `public.fn_usuario_es_admin()`
   - `public.fn_usuario_es_lector()`
   - `public.fn_usuario_id_actual()`
   - `public.fn_usuario_puede_gestionar_evento(bigint)`
2. Backup / snapshot de PROD (Dashboard → Database → o dump).
3. Ventana de bajo tráfico (altera `boletas_compradas`: `compra_id` pasa a nullable + constraints nuevas).
4. No reaplicar si ya existen objetos (ver checks abajo).

### Checks previos (SQL Editor en PROD)

```sql
-- Helpers requeridos
select to_regprocedure('public.fn_usuario_es_admin()'),
       to_regprocedure('public.fn_usuario_es_lector()'),
       to_regprocedure('public.fn_usuario_id_actual()'),
       to_regprocedure('public.fn_usuario_puede_gestionar_evento(bigint)');

-- ¿Ya está el módulo?
select to_regclass('public.compras_fantasma') as compras_fantasma,
       exists (
         select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = 'boletas_compradas'
           and column_name = 'compra_fantasma_id'
       ) as col_compra_fantasma_id;
```

- Si `compras_fantasma` **ya existe** y la columna también → **no** vuelvas a correr la migración 1; solo evalúa si falta la 2.
- Si ambos son null/false → aplica 1 y luego 2.

---

## Cómo aplicar (recomendado: SQL Editor)

Dashboard PROD → **SQL Editor** → New query.

### Paso A — Migración base

1. Abrir el contenido completo de  
   `supabase/migrations/20260915145642_compras_fantasma_boletas_compartidas.sql`
2. Pegarlo y **Run**.
3. Si falla a mitad, **no** improvisar: revisar el error, revertir con cuidado o restaurar snapshot.

### Paso B — Fix de escaneo

1. Abrir  
   `supabase/migrations/20260915153000_compras_fantasma_escaneo_lector.sql`
2. Pegarlo y **Run**.

### Paso C — Registrar en historial de migraciones (opcional pero recomendado)

Solo si en PROD usan `supabase_migrations.schema_migrations` con columnas `version`, `name`, `statements` (como en DEV):

```sql
insert into supabase_migrations.schema_migrations(version, name, statements)
values
  ('20260915145642', 'compras_fantasma_boletas_compartidas', array[]::text[]),
  ('20260915153000', 'compras_fantasma_escaneo_lector', array[]::text[]);
```

Si el insert falla por esquema distinto del CLI, anota a mano que esas versiones ya están en PROD.

---

## Alternativa CLI (solo si el link apunta a PROD)

```bash
# Verificar proyecto
npx supabase projects list
# Debe quedar linked a jiknhvnaavhfguqfqbod (PROD), NO a modctxrsohemzlzlvlih

npx supabase link --project-ref jiknhvnaavhfguqfqbod
npx supabase migration list --linked
npx supabase db push --linked
```

Si el historial remoto no coincide (como pasó en DEV), **no fuerces** un push masivo: usa el SQL Editor con los dos archivos de arriba.

---

## Verificación post-deploy (PROD)

```sql
-- Objetos
select to_regclass('public.compras_fantasma') as compras_fantasma,
       to_regclass('fantasma_private.puede_escanear') is not null as schema_ok,
       exists (
         select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = 'boletas_compradas'
           and column_name = 'compra_fantasma_id'
       ) as col_ok;

-- RPCs
select to_regprocedure('public.crear_compra_fantasma(uuid,integer,integer,jsonb,text)'),
       to_regprocedure('public.anular_compra_fantasma(integer)');

-- puede_escanear debe permitir admin o lector (no solo asignación exacta)
select pg_get_functiondef('fantasma_private.puede_escanear(integer)'::regprocedure);

-- Política restrictiva de lectura fantasma
select polname
from pg_policy
where polrelid = 'public.boletas_compradas'::regclass
  and polname = 'boletas_fantasma_lectura';
```

Prueba manual mínima (con admin en PROD, preferible evento de prueba):

1. Emitir 1 entrada fantasma (UI o RPC `crear_compra_fantasma`).
2. Ver que el titular la tiene en Mis compras.
3. Escanear el QR con un lector del evento → debe abrir validación (no “No encontrado”).
4. Validar una vez → segundo escaneo debe rechazar.
5. Anular emisión pendiente → entradas pendientes a `cancelada`.

Script de prueba integral (hace rollback; pensado para DEV):  
`scripts/verify-compras-fantasma-compartidas-dev.sql`  
Úsalo en PROD solo si entiendes que envuelve todo en transacción + `rollback` al final.

---

## Frontend (aparte de BD)

Hoy el módulo UI solo se enciende en DEV:

```ts
// src/app/core/compras-fantasma-feature.ts
supabaseConfig.url === 'https://modctxrsohemzlzlvlih.supabase.co'
```

Para que la pantalla `/compras-fantasma` y el menú aparezcan en PROD hay que **habilitar también** la URL  
`https://jiknhvnaavhfguqfqbod.supabase.co` (o un flag de environment) y desplegar el front.

Sin ese cambio de front, la BD puede estar lista pero la UI de admin no se verá en producción.

Código de app que ya asume el módulo (una vez el flag esté on):

- Ruta y menú admin
- `ComprasFantasmaService`
- Normalización en `boletas.service.ts` (pago “completado” visual para fantasma)
- Lector QR (usa la misma búsqueda de boletas)

---

## Checklist rápido PROD

- [ ] Backup PROD
- [ ] Checks previos (helpers + “¿ya existe?”)
- [ ] Aplicar `20260915145642_...sql`
- [ ] Aplicar `20260915153000_...sql`
- [ ] Verificación SQL post-deploy
- [ ] Prueba emitir → Mis compras → escanear → anular
- [ ] (Cuando toque) habilitar flag frontend para URL de PROD y deploy front
- [ ] Registrar versiones en `schema_migrations` si aplica

---

## Notas de riesgo

- `boletas_compradas.compra_id` deja de ser NOT NULL: cada fila debe tener **o** `compra_id` **o** `compra_fantasma_id` (check `boletas_origen_unico`).
- Políticas **RESTRICTIVE** en fantasma: anon no ve esas entradas; cliente solo las suyas; staff según política 2.
- No mezclar con el diseño viejo `boletas_fantasma` / códigos `EVF-` (ya descartado). En PROD solo debe vivir el modelo compartido (`compra_fantasma_id` + códigos `EVT-…`).
