\set ON_ERROR_STOP 1
grant all on all tables in schema public to authenticated;
-- Server writes a report for Robert (…01).
insert into public.reports (user_id, kind, period_start, period_end, data) values ('00000000-0000-0000-0000-000000000001', 'daily', current_date - 1, current_date - 1, '{}');
set role authenticated;
-- Mate (…02) asks to follow Robert.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$ begin
  assert (select count(*) from public.reports) = 0, 'mate cannot read robert reports';
  begin
    insert into public.follows (follower_id, followee_id, status) values (auth.uid(), '00000000-0000-0000-0000-000000000001', 'approved');
    raise exception 'FAIL: self-approved follow';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.follows (follower_id, followee_id) values ('00000000-0000-0000-0000-000000000001', auth.uid());
    raise exception 'FAIL: created a follow on behalf of someone else';
  exception when insufficient_privilege then null;
  end;
end $$;
insert into public.follows (followee_id) values ('00000000-0000-0000-0000-000000000001');
select public.approve_follow('00000000-0000-0000-0000-000000000002'); -- mate approving own request: must do nothing
do $$ begin
  assert (select status from public.follows) = 'pending', 'follower cannot approve own request';
  update public.follows set status = 'approved';
  assert (select status from public.follows) = 'pending', 'no direct updates';
end $$;
-- Robert approves.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select public.approve_follow('00000000-0000-0000-0000-000000000002');
do $$ begin
  assert (select status from public.follows) = 'approved', 'followee approves';
  assert (select count(*) from public.reports) = 1, 'robert reads own report';
end $$;
-- Mate stops following.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
delete from public.follows;
reset role;
do $$ begin assert (select count(*) from public.follows) = 0, 'follower can stop'; end $$;
select 'ALL REPORT RLS TESTS PASSED' as result;
