-- Process the notification email outbox once per minute.
--
-- The service-role JWT is provisioned separately in Supabase Vault under the
-- name below. Keeping the value out of migrations prevents it from entering
-- source control. Until that secret exists, the scheduled statement is a
-- deliberate no-op.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

select cron.schedule(
  'process-notification-emails-every-minute',
  '* * * * *',
  $job$
    select net.http_post(
      url := 'https://cdcnylgokphyltkctymi.supabase.co/functions/v1/process-notification-emails',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || credentials.service_role_key,
        'apikey', credentials.service_role_key
      ),
      body := jsonb_build_object('limit', 25),
      timeout_milliseconds := 30000
    ) as request_id
    from (
      select decrypted_secret as service_role_key
      from vault.decrypted_secrets
      where name = 'notification_email_worker_service_role'
      limit 1
    ) as credentials;
  $job$
);
