-- Run after both migrations and rls_test.sql.
\set ON_ERROR_STOP 1
grant all on all tables in schema public to authenticated;
insert into public.app_secrets values ('vapid', 'secret-value');
insert into public.notification_log (user_id, date, kind) values ('00000000-0000-0000-0000-000000000001', current_date, 'water');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://push.example/robert', 'k', 'a');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$ begin
  assert (select count(*) from public.app_secrets) = 0, 'secrets hidden from users';
  assert (select count(*) from public.push_subscriptions) = 0, 'mate cannot see robert devices';
  assert (select count(*) from public.notification_log) = 0, 'mate cannot see robert log';
  assert (select notification_prefs ->> 'water' from public.profiles where id = auth.uid()) = 'true', 'prefs default on';
end $$;
do $$ begin
  begin
    insert into public.notification_log (user_id, date, kind) values (auth.uid(), current_date, 'x');
    raise exception 'FAIL: user wrote log';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
do $$ begin
  assert (select count(*) from public.push_subscriptions) = 1, 'robert sees own device';
  assert (select count(*) from public.notification_log) = 1, 'robert sees own log';
end $$;
reset role;
select 'ALL NOTIFICATION RLS TESTS PASSED' as result;
