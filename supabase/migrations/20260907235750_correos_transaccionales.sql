-- Un registro por hecho notificable, no por intento de envío.
-- Solo el backend puede leer o modificar esta cola. No envía correos por sí sola.
create table public.correos_transaccionales (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  referencia text not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'procesando', 'aceptado', 'fallido')),
  intentos integer not null default 0 check (intentos >= 0),
  primer_intento_at timestamptz,
  proximo_intento_at timestamptz not null default now(),
  bloqueo_hasta timestamptz,
  -- Se congela antes del primer envío; se elimina 30 días después de la aceptación.
  mensaje jsonb,
  onesignal_id text,
  ultimo_error text,
  creado_at timestamptz not null default now(),
  aceptado_at timestamptz,
  unique (tipo, referencia)
);
alter table public.correos_transaccionales enable row level security;
revoke all on public.correos_transaccionales from public, anon, authenticated;
grant select, insert, update on public.correos_transaccionales to service_role;
create index correos_transaccionales_pendientes_idx
  on public.correos_transaccionales (proximo_intento_at)
  where estado in ('pendiente', 'procesando');
create index correos_transaccionales_limpieza_idx
  on public.correos_transaccionales (aceptado_at)
  where estado = 'aceptado' and (mensaje is not null or ultimo_error is not null);

-- SECURITY INVOKER: no eleva permisos ni permite a clientes encolar correos.
create function public.encolar_correo_checkout_aprobado()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.wompi_status = 'APPROVED' and new.estado = 'aprobada'
     and new.materializado and new.total > 0
     and (new.compra_id is not null or new.compra_producto_id is not null or new.compra_cover_id is not null) then
    -- No se envían confirmaciones históricas al recibir callbacks repetidos.
    if TG_OP = 'UPDATE' then
      if old.wompi_status = 'APPROVED' and old.estado = 'aprobada' and old.materializado then
        return new;
      end if;
    end if;
    insert into public.correos_transaccionales (tipo, referencia)
      values ('compra_confirmada', 'checkout:' || new.id::text)
      on conflict (tipo, referencia) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.encolar_correo_checkout_aprobado() from public, anon, authenticated;
grant execute on function public.encolar_correo_checkout_aprobado() to service_role;
create trigger correo_checkout_aprobado
  after insert or update on public.transacciones_checkout
  for each row execute function public.encolar_correo_checkout_aprobado();

-- Bloqueo atómico: workers simultáneos no toman el mismo registro.
-- Una ejecución interrumpida libera su trabajo después de cinco minutos.
create function public.tomar_correos_transaccionales(p_limite integer default 5)
returns setof public.correos_transaccionales
language plpgsql security invoker set search_path = '' as $$
begin
  update public.correos_transaccionales
    set estado = 'fallido', bloqueo_hasta = null,
        ultimo_error = coalesce(ultimo_error, 'Límite de reintentos alcanzado')
    where estado in ('pendiente', 'procesando')
      and (intentos >= 8 or primer_intento_at < now() - interval '27 days')
      and (bloqueo_hasta is null or bloqueo_hasta < now());
  return query
    with disponibles as (
      select id from public.correos_transaccionales
      where tipo = 'compra_confirmada' and intentos < 8
        and ((estado = 'pendiente' and proximo_intento_at <= now())
          or (estado = 'procesando' and bloqueo_hasta < now()))
      order by proximo_intento_at, creado_at
      limit greatest(1, least(coalesce(p_limite, 5), 5))
      for update skip locked
    )
    update public.correos_transaccionales c
      set estado = 'procesando', intentos = c.intentos + 1,
          primer_intento_at = coalesce(c.primer_intento_at, now()),
          bloqueo_hasta = now() + interval '5 minutes'
      from disponibles d where c.id = d.id
      returning c.*;
end;
$$;
revoke all on function public.tomar_correos_transaccionales(integer) from public, anon, authenticated;
grant execute on function public.tomar_correos_transaccionales(integer) to service_role;

-- Conserva la constancia mínima para deduplicar; elimina HTML y datos del destinatario.
create function public.limpiar_correos_transaccionales()
returns void language sql security invoker set search_path = '' as $$
  update public.correos_transaccionales set mensaje = null, ultimo_error = null
    where estado = 'aceptado' and aceptado_at < now() - interval '30 days'
      and (mensaje is not null or ultimo_error is not null);
$$;
revoke all on function public.limpiar_correos_transaccionales() from public, anon, authenticated;
grant execute on function public.limpiar_correos_transaccionales() to service_role;
