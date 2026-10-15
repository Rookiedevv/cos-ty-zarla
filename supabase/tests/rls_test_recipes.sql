\set ON_ERROR_STOP 1
grant all on all tables in schema public to authenticated;
set role authenticated;
-- Robert (…01) saves a recipe and logs a meal from it.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
insert into public.recipes (id, name, description, portions, total_kcal) values
  ('10000000-0000-0000-0000-000000000001', 'Bigos', 'kapusta, kiełbasa', 6, 3600);
-- Mate (…02) sees it, uses it, hides it, but can't change or delete it.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$ begin
  assert (select count(*) from public.recipes) = 1, 'mate reads robert recipe';
  update public.recipes set name = 'Mój bigos';
  assert (select name from public.recipes) = 'Bigos', 'mate cannot rename robert recipe';
  delete from public.recipes;
  assert (select count(*) from public.recipes) = 1, 'mate cannot delete robert recipe';
  begin
    insert into public.recipes (user_id, name, description, portions, total_kcal)
      values ('00000000-0000-0000-0000-000000000001', 'x', 'x', 1, 1);
    raise exception 'FAIL: saved a recipe as someone else';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.recipe_hides (user_id, recipe_id) values ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: hid a recipe for someone else';
  exception when insufficient_privilege then null;
  end;
end $$;
insert into public.recipe_hides (recipe_id) values ('10000000-0000-0000-0000-000000000001');
insert into public.meals (eaten_at, eaten_date, description, total_kcal, recipe_id)
  values (now(), current_date, 'Bigos, pół porcji', 300, '10000000-0000-0000-0000-000000000001');
-- Robert doesn't see the mate's hide, then deletes his recipe; the mate's meal stays without the link.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
do $$ begin
  assert (select count(*) from public.recipe_hides) = 0, 'hides are private';
end $$;
delete from public.recipes;
reset role;
do $$ begin
  assert (select count(*) from public.recipes) = 0, 'owner deletes';
  assert (select count(*) from public.recipe_hides) = 0, 'hides go with the recipe';
  assert (select recipe_id from public.meals where description = 'Bigos, pół porcji') is null, 'meal keeps, link cleared';
end $$;
-- Someone not signed in sees nothing.
insert into public.recipes (user_id, name, description, portions, total_kcal) values ('00000000-0000-0000-0000-000000000001', 'Zupa', 'x', 4, 800);
set role authenticated;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin assert (select count(*) from public.recipes) = 0, 'no profile, no recipes'; end $$;
reset role;
select 'ALL RECIPE RLS TESTS PASSED' as result;
