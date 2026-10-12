-- Coś ty żarła — Phase 2: AI meal estimates, cost tracking, photo storage

-- Every AI call with its cost. Written only by the server.
create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  at timestamptz not null default now(),
  model text not null,
  purpose text not null,
  tokens_in integer not null,
  tokens_out integer not null,
  cost_usd numeric(10,6) not null
);
create index on public.ai_usage (at);
alter table public.ai_usage enable row level security;
create policy "own rows: read" on public.ai_usage for select using (user_id = auth.uid());
create policy "admins read all" on public.ai_usage for select using (public.is_admin());

-- Spending alerts already sent, so each goes out once per month.
create table public.cost_alerts (
  month date not null,        -- first day of the month (UTC)
  level text not null,        -- 'warn' ($5) or 'stop' ($10)
  sent_at timestamptz not null default now(),
  primary key (month, level)
);
alter table public.cost_alerts enable row level security;

-- Meals keep their text description forever; the photo goes after 90 days.
alter table public.meals add column photo_deleted_at timestamptz;
