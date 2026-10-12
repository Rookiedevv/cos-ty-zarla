-- Run once in Supabase → SQL Editor, after replacing YOUR_CRON_SECRET.
-- Every 5 minutes, Supabase asks the app which reminders are due and the app sends them.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'send-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://cos-ty-zarla.vercel.app/api/cron/notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer YOUR_CRON_SECRET'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
