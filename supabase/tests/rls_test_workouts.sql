\set ON_ERROR_STOP 1
grant all on all tables in schema public to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
insert into public.checkins (date, sleep_hours, rest_day) values (current_date + 1, 7.5, false);
insert into public.workouts (date, kind, minutes, effort, kcal) values (current_date, 'run', 45, 'sweaty', 530);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$ begin
  assert (select count(*) from public.workouts) = 0, 'mate cannot see robert workouts';
  begin
    insert into public.workouts (user_id, date, kind, minutes, kcal) values ('00000000-0000-0000-0000-000000000001', current_date, 'walk', 10, 30);
    raise exception 'FAIL: wrote foreign workout';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select 'ALL WORKOUT RLS TESTS PASSED' as result;
