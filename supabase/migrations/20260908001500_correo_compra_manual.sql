-- Encola correo de confirmación al confirmar una venta manual (panel admin/organizador).
-- No usa transacciones_checkout ni Wompi. Cupones 100% del carrito no tienen estos marcadores.
-- SECURITY DEFINER: el UPDATE de compras lo hace authenticated; la cola solo acepta service_role.

create or replace function public.encolar_correo_compra_manual()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado_pago = 'completado'
     and old.estado_pago is distinct from 'completado'
     and (
       coalesce(new.datos_facturacion->>'creado_desde', '') in ('ventas_manual', 'ventas_admin')
       or coalesce(new.datos_facturacion->>'origen', '') in ('admin_manual', 'organizador_manual')
     ) then
    insert into public.correos_transaccionales (tipo, referencia)
      values ('compra_confirmada', 'compra:' || new.id::text)
      on conflict (tipo, referencia) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.encolar_correo_compra_manual() from public, anon, authenticated;
grant execute on function public.encolar_correo_compra_manual() to service_role;

drop trigger if exists correo_compra_manual on public.compras;
create trigger correo_compra_manual
  after update on public.compras
  for each row execute function public.encolar_correo_compra_manual();
