-- Еженедельный отчёт: каждый понедельник в 05:00 UTC (07:00–08:00 по Риге) вызываем Edge Function weekly-report.
-- Секрет вызова лежит в Vault под именем cron_secret (кладётся отдельно, в git не попадает)
-- и совпадает с секретом функции CRON_SECRET.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('weekly-report') where exists (select 1 from cron.job where jobname = 'weekly-report');
select cron.schedule('weekly-report', '0 5 * * 1', $$
  select net.http_post(
    url := 'https://zluiwncfigibykwyxhcj.supabase.co/functions/v1/weekly-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  )
$$);
