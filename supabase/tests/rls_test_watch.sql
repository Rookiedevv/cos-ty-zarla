-- Run after all migrations and the earlier tests.
\set ON_ERROR_STOP 1
grant all on all tables in schema public to authenticated;
insert into public.health_daily (user_id, date, steps, active_kcal) values ('00000000-0000-0000-0000-000000000001', current_date, 8000, 450);
insert into public.device_tokens (user_id, token_hash, label) values ('00000000-0000-0000-0000-000000000001', 'hash-r', 'Galaxy');
insert into public.pairing_codes (code_hash, user_id, expires_at) values ('code-r', '00000000-0000-0000-0000-000000000001', now() + interval '10 min');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$ begin
  assert (select count(*) from public.health_daily) = 0, 'mate cannot see robert health data';
  assert (select count(*) from public.device_tokens) = 0, 'mate cannot see robert devices';
  assert (select count(*) from public.pairing_codes) = 0, 'codes are server-only';
end $$;
delete from public.device_tokens; -- affects nothing for the mate
do $$ begin
  begin
    insert into public.health_daily (user_id, date, steps) values (auth.uid(), current_date, 1);
    raise exception 'FAIL: user wrote health data directly';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
do $$ begin
  assert (select steps from public.health_daily) = 8000, 'robert sees own data';
  assert (select count(*) from public.device_tokens) = 1, 'mate delete did nothing';
  assert (select count(*) from public.pairing_codes) = 0, 'codes hidden even from owner';
end $$;
delete from public.device_tokens where label = 'Galaxy';
do $$ begin assert (select count(*) from public.device_tokens) = 0, 'robert can disconnect'; end $$;
reset role;
select 'ALL WATCH RLS TESTS PASSED' as result;
