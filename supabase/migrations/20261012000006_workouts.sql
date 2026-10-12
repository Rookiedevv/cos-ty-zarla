-- Coś ty żarła — workouts replace the rest/light/moderate/hard plan

-- The morning check-in now records sleep, and whether it's a rest day.
-- Activity comes from the watch, or from the workouts below.
alter table public.checkins alter column planned_activity drop not null;
alter table public.checkins add column rest_day boolean not null default false;

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  date date not null,               -- the user's local date
  kind text not null check (kind in ('walk', 'run', 'gym', 'bike', 'football', 'swim', 'other')),
  minutes integer not null check (minutes between 1 and 600),
  effort text check (effort in ('easy', 'sweaty', 'exhausting')),
  description text check (char_length(description) <= 300), -- for 'other', in the person's own words
  kcal integer not null check (kcal between 0 and 5000),     -- above resting
  source text not null default 'quick' check (source in ('quick', 'ai')),
  created_at timestamptz not null default now()
);
create index on public.workouts (user_id, date);
alter table public.workouts enable row level security;
create policy "own rows" on public.workouts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
