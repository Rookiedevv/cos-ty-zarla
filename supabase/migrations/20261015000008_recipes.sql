-- Coś ty żarła — saved recipes (shared between everyone), hiding other people's recipes, meals logged from a recipe

-- A dish calculated in the recipe calculator and saved. Everyone in the app can see and use it;
-- only the person who saved it can rename or delete it.
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 200),
  description text not null check (char_length(description) between 1 and 3000), -- what the person typed or dictated
  portions smallint not null check (portions between 1 and 12),
  total_kcal integer not null check (total_kcal between 0 and 50000),
  total_protein_g numeric(7,1) check (total_protein_g is null or total_protein_g >= 0),
  cooked_weight_g integer check (cooked_weight_g is null or cooked_weight_g between 0 and 50000), -- AI estimate, whole dish
  items jsonb not null default '[]'::jsonb,   -- ingredients as the AI returned them
  assumptions text check (assumptions is null or char_length(assumptions) <= 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.recipes (created_at desc);
alter table public.recipes enable row level security;
-- Anyone with a profile (i.e. on the allow-list) can read every recipe.
create policy "everyone reads" on public.recipes for select
  using (exists (select 1 from public.profiles where id = auth.uid()));
create policy "own insert" on public.recipes for insert with check (user_id = auth.uid());
create policy "own update" on public.recipes for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own delete" on public.recipes for delete using (user_id = auth.uid());

-- Other people's recipes someone switched off for themselves.
create table public.recipe_hides (
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);
alter table public.recipe_hides enable row level security;
create policy "own rows" on public.recipe_hides for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Which recipe a meal was logged from. The meal stays if the recipe is deleted.
alter table public.meals add column recipe_id uuid references public.recipes (id) on delete set null;
