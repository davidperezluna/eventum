-- Prueba integral sobre DEV: todas las emisiones, traslados y notificaciones se revierten.
begin;
do $$
declare
  v_admin public.usuarios; v_cliente public.usuarios; v_destino public.usuarios;
  v_tipo public.tipos_boleta; v_id integer; v_b integer; v_b2 integer; v_t bigint;
  v_solicitud uuid:=gen_random_uuid(); v_items jsonb; v_res jsonb; v_count integer;
  v_snapshot text; v_after text; v_rechazado boolean;
begin
  select * into strict v_admin from public.usuarios where activo and tipo_usuario_id=3 and auth_user_id is not null order by id limit 1;
  select * into strict v_cliente from public.usuarios where activo and tipo_usuario_id=1 and auth_user_id is not null and nullif(trim(documento_identidad),'') is not null order by id limit 1;
  select * into strict v_destino from public.usuarios where activo and tipo_usuario_id=1 and id<>v_cliente.id and auth_user_id is not null and nullif(trim(documento_identidad),'') is not null order by id limit 1;
  select t.* into strict v_tipo from public.tipos_boleta t join public.eventos e on e.id=t.evento_id where t.activo and e.activo and not t.es_palco and t.personas_por_unidad=1 order by t.id limit 1;
  select md5(jsonb_build_object('compras',(select jsonb_agg(c order by id) from public.compras c),
    'boletas',(select jsonb_agg(b order by id) from public.boletas_compradas b where compra_id is not null),
    'tipos',(select jsonb_agg(t order by id) from public.tipos_boleta t))::text) into v_snapshot;
  v_items:=jsonb_build_array(jsonb_build_object('tipo_boleta_id',v_tipo.id,'cantidad',2));
  perform set_config('request.jwt.claim.sub',v_admin.auth_user_id::text,true);
  set local role authenticated;
  v_id:=public.crear_compra_fantasma(v_solicitud,v_tipo.evento_id,v_cliente.id,v_items,'Prueba transaccional');
  if public.crear_compra_fantasma(v_solicitud,v_tipo.evento_id,v_cliente.id,v_items,'Prueba transaccional')<>v_id then raise exception 'Idempotencia'; end if;
  select min(id),max(id),count(*) into v_b,v_b2,v_count from public.boletas_compradas where compra_fantasma_id=v_id and compra_id is null and precio_unitario=v_tipo.precio and not consume_inventario;
  if v_count<>2 then raise exception 'Origen/precio/inventario incorrectos'; end if;
  reset role;
  perform set_config('request.jwt.claim.sub','',true);
  set local role anon;
  select count(*) into v_count from public.boletas_compradas where compra_fantasma_id=v_id;
  if v_count<>0 then raise exception 'Anónimo ve las entradas'; end if;
  reset role;
  perform set_config('request.jwt.claim.sub',v_admin.auth_user_id::text,true);
  v_rechazado:=false;
  begin
    update public.tipos_boleta set es_palco=true where id=v_tipo.id;
    perform public.crear_compra_fantasma(gen_random_uuid(),v_tipo.evento_id,v_cliente.id,v_items,'Palco no permitido');
  exception when others then v_rechazado:=true; end;
  if not v_rechazado then raise exception 'Se permitió emitir palco'; end if;
  perform set_config('request.jwt.claim.sub',v_cliente.auth_user_id::text,true);
  set local role authenticated;
  select count(*) into v_count from public.boletas_compradas where compra_fantasma_id=v_id;
  if v_count<>2 then raise exception 'Cliente no ve entradas'; end if;
  v_rechazado:=false;
  begin perform public.crear_compra_fantasma(gen_random_uuid(),v_tipo.evento_id,v_cliente.id,v_items,'No permitido'); exception when others then v_rechazado:=true; end;
  if not v_rechazado then raise exception 'Cliente pudo emitir'; end if;
  v_rechazado:=false;
  begin update public.boletas_compradas set estado='usada' where id=v_b; exception when others then v_rechazado:=true; end;
  if not v_rechazado then raise exception 'Cliente pudo escanear'; end if;
  v_rechazado:=false;
  begin update public.boletas_compradas set compra_fantasma_id=null,compra_id=(select min(id) from public.compras) where id=v_b; exception when others then v_rechazado:=true; end;
  if not v_rechazado then raise exception 'Cliente pudo cambiar origen'; end if;
  v_res:=public.iniciar_traslado_boleta_palco(v_b,v_destino.email);
  if not (v_res->>'ok')::boolean then raise exception 'Iniciar transferencia: %',v_res; end if;
  v_t:=(v_res->>'traslado_id')::bigint;
  reset role;
  perform set_config('request.jwt.claim.sub',v_destino.auth_user_id::text,true);
  set local role authenticated;
  select count(*) into v_count from public.boletas_compradas where compra_fantasma_id=v_id;
  if v_count<>0 then raise exception 'Destinatario ve antes de aceptar'; end if;
  v_res:=public.aceptar_traslado_boleta_palco(v_t);
  if not (v_res->>'ok')::boolean then raise exception 'Aceptar transferencia: %',v_res; end if;
  select count(*) into v_count from public.boletas_compradas where id=v_b and titular_cliente_id=v_destino.id and asistente_usuario_id=v_destino.id and compra_fantasma_id=v_id and compra_id is null;
  if v_count<>1 then raise exception 'Transferencia perdió origen o titular'; end if;
  v_res:=public.iniciar_traslado_boleta_palco(v_b,v_cliente.email);
  if not (v_res->>'ok')::boolean then raise exception 'Retransferencia: %',v_res; end if;
  reset role;
  perform set_config('request.jwt.claim.sub',v_admin.auth_user_id::text,true);
  set local role authenticated;
  update public.boletas_compradas set estado='usada',fecha_uso=localtimestamp where id=v_b and estado='pendiente';
  v_rechazado:=false;
  begin update public.boletas_compradas set estado='usada' where id=v_b; exception when others then v_rechazado:=true; end;
  if not v_rechazado then raise exception 'Segundo escaneo permitido'; end if;
  reset role;
  perform set_config('request.jwt.claim.sub',v_cliente.auth_user_id::text,true);
  set local role authenticated;
  v_res:=public.aceptar_traslado_boleta_palco((v_res->>'traslado_id')::bigint);
  if (v_res->>'ok')::boolean then raise exception 'Aceptó transferencia de entrada usada'; end if;
  reset role;
  perform set_config('request.jwt.claim.sub',v_admin.auth_user_id::text,true);
  set local role authenticated;
  perform public.anular_compra_fantasma(v_id);
  select count(*) into v_count from public.boletas_compradas where id=v_b2 and estado='cancelada';
  if v_count<>1 then raise exception 'Anulación falló'; end if;
  select count(*) into v_count from public.boletas_compradas where id=v_b and estado='usada';
  if v_count<>1 then raise exception 'Anulación borró uso'; end if;
  reset role;
  select md5(jsonb_build_object('compras',(select jsonb_agg(c order by id) from public.compras c),
    'boletas',(select jsonb_agg(b order by id) from public.boletas_compradas b where compra_id is not null),
    'tipos',(select jsonb_agg(t order by id) from public.tipos_boleta t))::text) into v_after;
  if v_snapshot<>v_after then raise exception 'Se modificaron ventas o inventario normal'; end if;
end; $$;
rollback;
select 'PASS: emisión, idempotencia, precio, permisos, transferencia, retransferencia, escaneo único, anulación y aislamiento comercial' as resultado;
