# Guía para pasar a producción la devolución de eventos cancelados

Esta guía documenta únicamente los SQL que creamos para el flujo de eventos cancelados,
contacto del organizador por WhatsApp y devolución desde el lector.

## Proyectos configurados

- Dev: `modctxrsohemzlzlvlih`
- Producción: `jiknhvnaavhfguqfqbod`

Antes de ejecutar comandos destructivos, confirma siempre el proyecto actualmente enlazado.

## 1. Revisar las migraciones pendientes

Desde la raíz del proyecto:

```powershell
cd C:\eventum
supabase migration list
```

Las migraciones deben tener nombres con este formato:

```text
YYYYMMDDHHMMSS_nombre.sql
```

Los archivos `.txt` dentro de `supabase/migrations` son documentación y Supabase los ignora.

## 2. Probar primero en dev

Enlazar el CLI a dev:

```powershell
supabase link --project-ref modctxrsohemzlzlvlih
```

Confirmar el estado y aplicar:

```powershell
supabase migration list
supabase db push
```

Si el CLI solicita la contraseña de la base de datos, usar la contraseña de la base de datos de dev, no la de producción.

Después de aplicar, probar manualmente:

- Inicio de sesión.
- `/mis-compras` con un evento cancelado.
- Botón de WhatsApp del organizador.
- QR de una boleta cancelada.
- Escaneo con un lector que tenga permiso sobre el evento.
- Registrar devolución y confirmar que la boleta pase a `usada`.
- Intentar escanearla nuevamente y confirmar que no se procese dos veces.

## 3. Revisar qué se enviará a producción

No modificar ni reutilizar una migración que ya fue aplicada en dev. Si hay un cambio nuevo, crear otra migración con un timestamp posterior.

Revisar los archivos SQL pendientes y confirmar especialmente que no contengan:

- `DROP TABLE` o `DROP COLUMN` no autorizados.
- `TRUNCATE` o `DELETE` masivos.
- Cambios de políticas RLS que puedan bloquear el inicio de sesión.
- Contraseñas, tokens o claves privadas.

## 4. Pasar las migraciones a producción

Enlazar el CLI al proyecto de producción:

```powershell
supabase link --project-ref jiknhvnaavhfguqfqbod
```

Confirmar que el enlace quedó en producción:

```powershell
supabase migration list
```

Aplicar las migraciones:

```powershell
supabase db push
```

El comando debe indicar que las migraciones fueron aplicadas. Si dice `Remote database is up to date`, significa que no hay migraciones pendientes para ese proyecto.

## 5. Verificación posterior en producción

Comprobar inmediatamente:

1. Inicio de sesión de un usuario cliente.
2. Inicio de sesión de un lector.
3. Visualización de un evento normal.
4. Visualización de un evento cancelado en `Mis compras`.
5. Acceso al botón de WhatsApp.
6. Escaneo de una boleta cancelada con un lector autorizado.
7. Confirmar que la boleta se marque como `usada`.
8. Confirmar que un lector sin permiso no pueda procesarla.

## SQL creados para este desarrollo

Estos archivos deben conservarse y aplicarse en este orden cronológico:

### 1. Eventos cancelados visibles para compradores

```text
supabase/migrations/20260916110000_eventos_cancelados_visibles_compradores.sql
```

Permite que los compradores sigan recibiendo la información del evento cancelado en `Mis compras`.

### 2. Política temporal de contacto del organizador

```text
supabase/migrations/20260916120000_contacto_organizador_compradores.sql
```

Esta migración creó una política RLS que provocó recursión en `usuarios`. No debe eliminarse del historial.

### 3. Reversión de esa política

```text
supabase/migrations/20260916121000_revert_policy_contacto_organizador.sql
```

Elimina la política anterior y evita el error:

```text
infinite recursion detected in policy for relation "usuarios"
```

Debe aplicarse después de `20260916120000`.

### 4. RPC segura para obtener el teléfono del organizador

```text
supabase/migrations/20260916122000_contacto_organizador_evento_rpc.sql
```

Crea la función `obtener_contacto_organizador_evento`, usada para construir el botón de WhatsApp sin modificar las políticas de `usuarios`.

### 5. Devolución mediante escaneo del lector

```text
supabase/migrations/20260916123000_devolucion_boleta_evento_cancelado.sql
```

Crea la función `marcar_boleta_devolucion_evento_cancelado`, que:

- exige sesión autenticada;
- verifica que el evento esté cancelado;
- verifica que la boleta esté pendiente;
- verifica que el lector tenga permiso para ese evento y tipo de boleta;
- marca la boleta como `usada`, igual que el escaneo normal en puerta.

No crea un estado nuevo de boleta.

## Comandos exactos para producción

Primero prueba todos los archivos en dev:

```powershell
cd C:\eventum
supabase link --project-ref modctxrsohemzlzlvlih
supabase migration list
supabase db push
```

Cuando el flujo esté validado en dev, enlaza producción y aplica exactamente el mismo conjunto:

```powershell
cd C:\eventum
supabase link --project-ref jiknhvnaavhfguqfqbod
supabase migration list
supabase db push
```

Supabase ejecutará los archivos pendientes por timestamp. No hay que pegar los SQL manualmente en el editor de Postgres.

## Qué verificar en producción

- El cliente puede iniciar sesión.
- El evento cancelado aparece con su información en `Mis compras`.
- Se muestra el contacto y el botón de WhatsApp.
- El lector autorizado puede escanear el QR de devolución.
- La boleta pasa a `usada`.
- Un segundo escaneo no vuelve a procesarla.
- Un lector sin permiso no puede registrar la devolución.

## Importante

El proyecto enlazado por el CLI es local para esa terminal. Si cambiaste de producción a dev, vuelve a ejecutar `supabase link` con el project ref correspondiente antes de usar `supabase db push`.

Nunca ejecutes `supabase db push` sin revisar antes el resultado de:

```powershell
supabase migration list
```
