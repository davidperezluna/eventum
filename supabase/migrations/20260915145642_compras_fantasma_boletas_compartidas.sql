-- Emisiones administrativas sin venta. Las entradas y los traslados son compartidos.
-- Aplicar inicialmente solo en DEV modctxrsohemzlzlvlih.
begin;
create schema if not exists fantasma_private;
revoke all on schema fantasma_private from public, anon;
grant usage on schema fantasma_private to authenticated;

create table public.compras_fantasma (
  id integer generated always as identity primary key,
  solicitud_id uuid not null unique,
  evento_id integer not null references public.eventos(id),
  cliente_id integer not null references public.usuarios(id),
  creado_por_usuario_id integer not null references public.usuarios(id),
  fecha_creacion timestamptz not null default now(),
  estado text not null default 'activa' check (estado in ('activa','cancelada')),
  motivo text not null check (length(trim(motivo)) between 3 and 500),
  solicitud jsonb not null,
  fecha_cancelacion timestamptz,
  cancelado_por_usuario_id integer references public.usuarios(id)
);
create index compras_fantasma_evento_idx on public.compras_fantasma(evento_id,fecha_creacion desc);
create index compras_fantasma_cliente_idx on public.compras_fantasma(cliente_id);
create index compras_fantasma_creador_idx on public.compras_fantasma(creado_por_usuario_id);
create index compras_fantasma_cancelador_idx on public.compras_fantasma(cancelado_por_usuario_id);
alter table public.compras_fantasma enable row level security;
revoke all on public.compras_fantasma from public,anon,authenticated;
grant select on public.compras_fantasma to authenticated;
create policy compras_fantasma_admin on public.compras_fantasma for select to authenticated
using ((select public.fn_usuario_es_admin()));

alter table public.boletas_compradas alter column compra_id drop not null;
alter table public.boletas_compradas add column compra_fantasma_id integer references public.compras_fantasma(id);
alter table public.boletas_compradas add constraint boletas_origen_unico
check ((compra_id is not null) <> (compra_fantasma_id is not null));
alter table public.boletas_compradas add constraint boletas_fantasma_individuales
check (compra_fantasma_id is null or (not consume_inventario and palco_id is null and grupo_palco_id is null and titular_cliente_id is not null));
create index boletas_compra_fantasma_idx on public.boletas_compradas(compra_fantasma_id) where compra_fantasma_id is not null;

-- Misma regla de validación en puerta que boletas comerciales (admin o cualquier lector).
create function fantasma_private.puede_escanear(p_tipo integer) returns boolean
language sql stable security definer set search_path='' as $$
select auth.uid() is not null and (public.fn_usuario_es_admin() or public.fn_usuario_es_lector()); $$;

-- Restringe solo las filas nuevas, incluso si existen políticas permisivas heredadas.
-- Lectura alineada con boletas comerciales: titular, admin, lector u organizador del evento.
-- El permiso fino de puerta lo aplica el frontend; la validación la refuerza el trigger.
create policy boletas_fantasma_lectura on public.boletas_compradas as restrictive for select to anon,authenticated
using (compra_fantasma_id is null or (auth.uid() is not null and (
  titular_cliente_id=(select public.fn_usuario_id_actual())
  or public.fn_usuario_es_admin()
  or public.fn_usuario_es_lector()
  or exists (
    select 1 from public.tipos_boleta tb
    where tb.id=tipo_boleta_id and public.fn_usuario_puede_gestionar_evento(tb.evento_id)
  )
)));
create policy boletas_fantasma_insercion on public.boletas_compradas as restrictive for insert to anon,authenticated
with check (compra_fantasma_id is null);
create policy boletas_fantasma_borrado on public.boletas_compradas as restrictive for delete to anon,authenticated
using (compra_fantasma_id is null);

create function fantasma_private.proteger_boleta() returns trigger
language plpgsql set search_path='' as $$
begin
  if old.compra_fantasma_id is null and new.compra_fantasma_id is null then return new; end if;
  if (new.compra_id,new.compra_fantasma_id,new.tipo_boleta_id,new.codigo_qr,new.precio_unitario,new.consume_inventario)
     is distinct from (old.compra_id,old.compra_fantasma_id,old.tipo_boleta_id,old.codigo_qr,old.precio_unitario,old.consume_inventario) then
    raise exception 'No se puede modificar el origen ni el valor de la entrada';
  end if;
  if current_user in ('anon','authenticated') then
    if auth.uid() is null then raise exception 'Sesión requerida'; end if;
    if old.estado <> 'pendiente' then raise exception 'La entrada ya fue utilizada o anulada'; end if;
    if new.titular_cliente_id is distinct from old.titular_cliente_id then
      raise exception 'Usa el flujo de transferencia';
    end if;
    if new.estado is distinct from old.estado then
      if old.estado <> 'pendiente' or new.estado <> 'usada' or not fantasma_private.puede_escanear(old.tipo_boleta_id) then
        raise exception 'Entrada no disponible o sin permiso para validar';
      end if;
      new.fecha_uso := localtimestamp;
      new.validado_por_usuario_id := public.fn_usuario_id_actual();
    elsif (new.fecha_uso,new.validado_por_usuario_id) is distinct from (old.fecha_uso,old.validado_por_usuario_id) then
      raise exception 'No se puede modificar la validación';
    end if;
    if new.asistente_usuario_id is distinct from old.asistente_usuario_id and
      (old.estado <> 'pendiente' or old.titular_cliente_id is distinct from public.fn_usuario_id_actual() or new.asistente_usuario_id is distinct from old.titular_cliente_id) then
      raise exception 'Solo el titular puede vincular su perfil';
    end if;
  end if;
  return new;
end; $$;
create trigger trg_fantasma_proteger before update on public.boletas_compradas
for each row execute function fantasma_private.proteger_boleta();

create function fantasma_private.crear(p_solicitud_id uuid,p_evento_id integer,p_cliente_id integer,p_items jsonb,p_motivo text)
returns integer language plpgsql security definer set search_path='' as $$
declare v_id integer; v_previa public.compras_fantasma; v_item jsonb; v_tipo public.tipos_boleta;
v_cantidad integer; v_total integer:=0; v_solicitud jsonb;
begin
  if auth.uid() is null or not public.fn_usuario_es_admin() then raise exception 'Solo el administrador puede emitir entradas'; end if;
  if p_solicitud_id is null or length(trim(coalesce(p_motivo,''))) not between 3 and 500 then raise exception 'Solicitud y motivo requeridos'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Selecciona entradas individuales'; end if;
  if jsonb_array_length(p_items) not between 1 and 20 then raise exception 'Selecciona entre 1 y 20 tipos'; end if;
  v_solicitud:=jsonb_build_object('evento_id',p_evento_id,'cliente_id',p_cliente_id,'items',p_items,'motivo',trim(p_motivo));
  perform pg_advisory_xact_lock(hashtextextended(p_solicitud_id::text,0));
  select * into v_previa from public.compras_fantasma where solicitud_id=p_solicitud_id;
  if found then
    if v_previa.solicitud<>v_solicitud or v_previa.creado_por_usuario_id<>public.fn_usuario_id_actual() then raise exception 'Solicitud ya utilizada'; end if;
    return v_previa.id;
  end if;
  if not exists(select 1 from public.eventos where id=p_evento_id and activo) then raise exception 'Evento no disponible'; end if;
  if not exists(select 1 from public.usuarios where id=p_cliente_id and activo) then raise exception 'Titular no disponible'; end if;
  insert into public.compras_fantasma(solicitud_id,evento_id,cliente_id,creado_por_usuario_id,motivo,solicitud)
  values(p_solicitud_id,p_evento_id,p_cliente_id,public.fn_usuario_id_actual(),trim(p_motivo),v_solicitud) returning id into v_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(v_item->>'tipo_boleta_id','') !~ '^[1-9][0-9]{0,8}$' or coalesce(v_item->>'cantidad','') !~ '^[1-9][0-9]{0,2}$' then raise exception 'Tipo o cantidad inválida'; end if;
    v_cantidad:=(v_item->>'cantidad')::integer;
    v_total:=v_total+v_cantidad;
    if v_total>100 then raise exception 'Máximo 100 entradas por emisión'; end if;
    select * into v_tipo from public.tipos_boleta where id=(v_item->>'tipo_boleta_id')::integer for share;
    if not found or v_tipo.evento_id<>p_evento_id or v_tipo.activo is distinct from true or v_tipo.es_palco or v_tipo.personas_por_unidad<>1 then raise exception 'Solo boletas individuales activas del evento'; end if;
    insert into public.boletas_compradas(compra_fantasma_id,tipo_boleta_id,codigo_qr,precio_unitario,titular_cliente_id,asistente_usuario_id,consume_inventario,estado)
    select v_id,v_tipo.id,'EVT-'||gen_random_uuid()::text,v_tipo.precio,p_cliente_id,p_cliente_id,false,'pendiente'
    from generate_series(1,v_cantidad);
  end loop;
  return v_id;
end; $$;

create function fantasma_private.anular(p_id integer) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.fn_usuario_es_admin() then raise exception 'Solo el administrador puede anular'; end if;
  perform 1 from public.compras_fantasma where id=p_id for update;
  if not found then raise exception 'Emisión no encontrada'; end if;
  perform 1 from public.boletas_compradas where compra_fantasma_id=p_id order by id for update;
  update public.boletas_compradas set estado='cancelada' where compra_fantasma_id=p_id and estado='pendiente';
  update public.traslados_boleta set estado='cancelado',fecha_cancelacion=now()
  where boleta_id in (select id from public.boletas_compradas where compra_fantasma_id=p_id) and estado in ('enviado','recibido');
  update public.compras_fantasma set estado='cancelada',fecha_cancelacion=now(),cancelado_por_usuario_id=public.fn_usuario_id_actual()
  where id=p_id and estado='activa';
end; $$;
create function public.crear_compra_fantasma(p_solicitud_id uuid,p_evento_id integer,p_cliente_id integer,p_items jsonb,p_motivo text)
returns integer language sql security invoker set search_path='' as $$ select fantasma_private.crear(p_solicitud_id,p_evento_id,p_cliente_id,p_items,p_motivo); $$;
create function public.anular_compra_fantasma(p_id integer) returns void
language sql security invoker set search_path='' as $$ select fantasma_private.anular(p_id); $$;
revoke all on all functions in schema fantasma_private from public,anon,authenticated;
grant execute on function fantasma_private.crear(uuid,integer,integer,jsonb,text),fantasma_private.anular(integer),fantasma_private.puede_escanear(integer) to authenticated;
revoke all on function public.crear_compra_fantasma(uuid,integer,integer,jsonb,text),public.anular_compra_fantasma(integer) from public,anon,authenticated;
grant execute on function public.crear_compra_fantasma(uuid,integer,integer,jsonb,text),public.anular_compra_fantasma(integer) to authenticated;

-- Compatibilidad con el flujo existente de asignación, traslado y notificación.
CREATE OR REPLACE FUNCTION public.iniciar_traslado_boleta_palco(p_boleta_id bigint, p_email_destino text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid BIGINT;
  v_b public.boletas_compradas%ROWTYPE;
  v_compra public.compras%ROWTYPE;
  v_destino_id BIGINT;
  v_traslado_id BIGINT;
  v_email TEXT;
BEGIN
  v_uid := public.fn_usuario_id_actual();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sesión requerida');
  END IF;

  v_email := lower(trim(coalesce(p_email_destino, '')));
  IF v_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Email requerido');
  END IF;

  SELECT * INTO v_b FROM public.boletas_compradas WHERE id = p_boleta_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Boleta no encontrada');
  END IF;

  SELECT * INTO v_compra FROM public.compras WHERE id = v_b.compra_id;
  IF NOT ((v_b.compra_id IS NOT NULL AND v_compra.estado_pago = 'completado') OR EXISTS (SELECT 1 FROM public.compras_fantasma cf WHERE cf.id = v_b.compra_fantasma_id AND cf.estado = 'activa')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El pago de la compra no está confirmado');
  END IF;

  IF coalesce(v_b.titular_cliente_id, v_compra.cliente_id) IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No eres titular de esta entrada');
  END IF;

  IF v_b.estado IN ('usada', 'cancelada') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta entrada ya no se puede transferir');
  END IF;

  IF public.fn_traslado_boleta_palco_activo(v_b.id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ya hay un traslado pendiente para esta entrada');
  END IF;

  SELECT u.id INTO v_destino_id
  FROM public.usuarios u
  WHERE lower(u.email) = v_email AND u.activo = true
  LIMIT 1;

  IF v_destino_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No hay usuario registrado con ese correo');
  END IF;

  IF v_destino_id = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No puedes enviarte la entrada a ti mismo');
  END IF;

  IF nullif(trim(coalesce((SELECT documento_identidad FROM public.usuarios WHERE id = v_destino_id), '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El destinatario debe tener documento en Mi perfil');
  END IF;

  INSERT INTO public.traslados_boleta (
    boleta_id, usuario_origen_id, usuario_destino_id, email_destino, estado
  ) VALUES (
    v_b.id, v_uid, v_destino_id, v_email, 'enviado'
  )
  RETURNING id INTO v_traslado_id;

  RETURN jsonb_build_object('ok', true, 'traslado_id', v_traslado_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rellenar_asistente_palco_desde_perfil(p_boleta_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid BIGINT;
  v_b public.boletas_compradas%ROWTYPE;
  v_compra public.compras%ROWTYPE;
  v_doc TEXT;
BEGIN
  v_uid := public.fn_usuario_id_actual();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sesión requerida');
  END IF;

  SELECT documento_identidad INTO v_doc FROM public.usuarios WHERE id = v_uid;
  IF nullif(trim(coalesce(v_doc, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Debes registrar tu documento en Mi perfil antes de vincular la entrada');
  END IF;

  SELECT * INTO v_b FROM public.boletas_compradas WHERE id = p_boleta_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Boleta no encontrada');
  END IF;

  SELECT * INTO v_compra FROM public.compras WHERE id = v_b.compra_id;
  IF NOT ((v_b.compra_id IS NOT NULL AND v_compra.estado_pago = 'completado') OR EXISTS (SELECT 1 FROM public.compras_fantasma cf WHERE cf.id = v_b.compra_fantasma_id AND cf.estado = 'activa')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El pago de la compra no está confirmado');
  END IF;

  IF coalesce(v_b.titular_cliente_id, v_compra.cliente_id) IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No eres titular de esta entrada');
  END IF;

  IF v_b.estado IN ('usada', 'cancelada') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta entrada ya no se puede vincular');
  END IF;

  UPDATE public.boletas_compradas
  SET asistente_usuario_id = v_uid
  WHERE id = v_b.id;

  RETURN jsonb_build_object('ok', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.aceptar_traslado_boleta_palco(p_traslado_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid BIGINT;
  v_t public.traslados_boleta%ROWTYPE;
  v_doc TEXT;
  v_b public.boletas_compradas%ROWTYPE;
BEGIN
  v_uid := public.fn_usuario_id_actual();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sesión requerida');
  END IF;

  SELECT documento_identidad INTO v_doc FROM public.usuarios WHERE id = v_uid;
  IF nullif(trim(coalesce(v_doc, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Debes registrar tu documento en Mi perfil antes de aceptar');
  END IF;

  SELECT * INTO v_t FROM public.traslados_boleta WHERE id = p_traslado_id FOR UPDATE;
  IF NOT FOUND OR v_t.boleta_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Traslado no encontrado');
  END IF;
  IF v_t.usuario_destino_id IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
  END IF;
  IF v_t.estado NOT IN ('enviado', 'recibido') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Este traslado ya fue procesado');
  END IF;

  SELECT * INTO v_b FROM public.boletas_compradas WHERE id=v_t.boleta_id FOR UPDATE;
  IF NOT FOUND OR v_b.estado <> 'pendiente' OR v_b.titular_cliente_id IS DISTINCT FROM v_t.usuario_origen_id THEN
    RETURN jsonb_build_object('ok',false,'error','La entrada ya no está disponible para transferir');
  END IF;
  IF v_b.compra_fantasma_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.compras_fantasma WHERE id=v_b.compra_fantasma_id AND estado='activa') THEN
    RETURN jsonb_build_object('ok',false,'error','La emisión fue anulada');
  END IF;
  UPDATE public.boletas_compradas
  SET
    titular_cliente_id = v_uid,
    asistente_usuario_id = v_uid
  WHERE id = v_t.boleta_id;

  UPDATE public.traslados_boleta
  SET estado = 'aceptado', fecha_aceptacion = now()
  WHERE id = v_t.id;

  RETURN jsonb_build_object('ok', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.es_boleta_trasladable_palco(p_boleta_id integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.boletas_compradas b
    LEFT JOIN public.compras c ON c.id = b.compra_id
    WHERE b.id = p_boleta_id
      AND (c.estado_pago = 'completado'::public.tipo_estado_pago OR EXISTS (SELECT 1 FROM public.compras_fantasma cf WHERE cf.id=b.compra_fantasma_id AND cf.estado='activa'))
      AND b.estado = 'pendiente'::public.tipo_estado_boleta
  );
$function$
;

CREATE OR REPLACE FUNCTION public.fn_notificar_entrada_validada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_usuario_objetivo BIGINT;
  v_evento_id BIGINT;
  v_evento_titulo TEXT;
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado AND NEW.estado = 'usada' THEN
    SELECT c.cliente_id, c.evento_id
      INTO v_usuario_objetivo, v_evento_id
    FROM public.compras c
    WHERE c.id = NEW.compra_id;

    IF NEW.compra_fantasma_id IS NOT NULL THEN
      SELECT cf.cliente_id,cf.evento_id INTO v_usuario_objetivo,v_evento_id
      FROM public.compras_fantasma cf WHERE cf.id=NEW.compra_fantasma_id;
    END IF;
    IF NEW.titular_cliente_id IS NOT NULL THEN
      v_usuario_objetivo := NEW.titular_cliente_id;
    END IF;

    SELECT e.titulo
      INTO v_evento_titulo
    FROM public.eventos e
    WHERE e.id = v_evento_id;

    IF v_usuario_objetivo IS NOT NULL THEN
      INSERT INTO public.notificaciones_usuario (
        usuario_id,
        tipo,
        titulo,
        mensaje,
        metadata
      )
      VALUES (
        v_usuario_objetivo,
        'entrada_validada',
        'Entrada validada',
        COALESCE(
          'Tu entrada del evento "' || COALESCE(v_evento_titulo, 'Evento') || '" fue validada en puerta.',
          'Tu entrada fue validada en puerta.'
        ),
        jsonb_build_object(
          'boleta_id', NEW.id,
          'compra_id', NEW.compra_id,
          'evento_id', v_evento_id,
          'codigo_qr', NEW.codigo_qr,
          'estado', NEW.estado,
          'fecha_uso', NEW.fecha_uso
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;
commit;
