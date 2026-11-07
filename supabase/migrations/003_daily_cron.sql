-- Утреннее письмо со списком дел: каждый день в 04:30 UTC (06:30 по Риге зимой, 07:30 летом).
-- Отправляется только хозяйствам, где в настройках включено «утреннее письмо» (data.settings.dailyMail).
select cron.unschedule('daily-tasks') where exists (select 1 from cron.job where jobname = 'daily-tasks');
select cron.schedule('daily-tasks', '30 4 * * *', $$
  select net.http_post(
    url := 'https://zluiwncfigibykwyxhcj.supabase.co/functions/v1/weekly-report?mode=daily',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  )
$$);
