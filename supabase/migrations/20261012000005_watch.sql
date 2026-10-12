-- Coś ty żarła — Phase 5: smartwatch data from the Android companion app

-- Daily totals sent by the companion app (read from Health Connect).
create table public.health_daily (
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,                  -- the user's local date
  steps integer check (steps >= 0),
  active_kcal integer check (active_kcal >= 0),
  exercise_minutes integer check (exercise_minutes >= 0),
  sleep_minutes integer check (sleep_minutes between 0 and 1440), -- sleep that ended this morning
  sleep_end timestamptz,
  source text not null default 'health_connect',
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);
alter table public.health_daily enable row level security;
create policy "own rows: read" on public.health_daily for select using (user_id = auth.uid());

-- Connected companion apps. Only a hash of each token is stored.
create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token_hash text not null unique,
  label text,
  created_at timestamptz not null default now(),
  last_sync_at timestamptz
);
create index on public.device_tokens (user_id);
alter table public.device_tokens enable row level security;
create policy "own devices: read" on public.device_tokens for select using (user_id = auth.uid());
create policy "own devices: disconnect" on public.device_tokens for delete using (user_id = auth.uid());

-- One-time codes shown in Settings and typed into the companion app (valid 10 minutes).
create table public.pairing_codes (
  code_hash text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);
alter table public.pairing_codes enable row level security;
-- No user policies: codes are created and redeemed only by the server.
