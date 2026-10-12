-- Run after the migrations on the stub database. Any failed assertion aborts with an error.
\set ON_ERROR_STOP 1
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;

insert into public.allowed_emails values ('robert@example.com', true), ('mate@example.com', false);

-- 1. Sign-up gate
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'Robert@Example.com', '{"full_name":"Robert"}'),
  ('00000000-0000-0000-0000-000000000002', 'mate@example.com', '{}');
do $$ begin
  begin
    insert into auth.users (email) values ('stranger@example.com');
    raise exception 'FAIL: stranger was allowed';
  exception when others then
    if sqlerrm not like 'EMAIL_NOT_ALLOWED%' then raise; end if;
  end;
  assert (select count(*) from public.profiles) = 2, 'two profiles';
  assert (select is_admin from public.profiles where email = 'robert@example.com'), 'robert admin';
  assert (select display_name from public.profiles where email = 'robert@example.com') = 'Robert', 'name';
end $$;

-- 2. As the mate: can't see Robert, can't make himself admin
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$ begin
  assert (select count(*) from public.profiles) = 1, 'mate sees only own profile';
  assert (select count(*) from public.allowed_emails) = 0, 'mate cannot read allow-list';
end $$;
update public.profiles set is_admin = true, sex = 'male' where id = auth.uid();
do $$ begin
  assert not (select is_admin from public.profiles where id = auth.uid()), 'self-promotion blocked';
  assert (select sex from public.profiles where id = auth.uid()) = 'male', 'normal update works';
end $$;
insert into public.meals (eaten_at, eaten_date, description, total_kcal) values (now(), current_date, 'eggs', 300);
insert into public.weights (date, kg) values (current_date, 90);

-- Can't write rows for someone else
do $$ begin
  begin
    insert into public.weights (user_id, date, kg) values ('00000000-0000-0000-0000-000000000001', current_date, 80);
    raise exception 'FAIL: wrote foreign row';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 3. As Robert: sees only own data, can manage allow-list
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
do $$ begin
  assert (select count(*) from public.meals) = 0, 'robert does not see mate meals';
  assert (select count(*) from public.weights) = 0, 'robert does not see mate weight';
  assert (select count(*) from public.allowed_emails) = 2, 'admin reads allow-list';
end $$;
insert into public.allowed_emails (email) values ('new@example.com');
insert into public.meals (id, eaten_at, eaten_date, description, total_kcal)
  values ('10000000-0000-0000-0000-000000000001', now(), current_date, 'toast', 200);
insert into public.meal_items (meal_id, name, kcal) values ('10000000-0000-0000-0000-000000000001', 'toast', 200);
do $$ begin
  assert (select kcal from public.daily_intake where date = current_date) = 200, 'daily intake view';
end $$;
reset role;
select 'ALL RLS TESTS PASSED' as result;
