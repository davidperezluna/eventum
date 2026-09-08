-- Ejecutar manualmente DESPUÉS de la migración, deploy y configuración de Vault.
-- Vault debe contener eventum_project_url y eventum_email_worker_secret.
-- La función se despliega con --no-verify-jwt y valida x-worker-secret por sí misma.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'eventum_project_url')
     or not exists (select 1 from vault.decrypted_secrets where name = 'eventum_email_worker_secret') then
    raise exception 'Configura eventum_project_url y eventum_email_worker_secret en Vault primero';
  end if;
end;
$$;

-- Reutiliza el mismo nombre al ejecutar de nuevo: no crea varios cron iguales.
select cron.schedule(
  'eventum-correos-transaccionales', '* * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'eventum_project_url')
      || '/functions/v1/transactional-email-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'eventum_email_worker_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);
