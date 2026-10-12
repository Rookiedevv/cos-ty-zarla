-- Coś ty żarła — Phase 4a: push notifications

-- One row per device that allowed notifications.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);
create index on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "own rows" on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- What was sent, so each reminder goes out at most once per day.
create table public.notification_log (
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,          -- the user's local date
  kind text not null,          -- e.g. 'checkin_1', 'window_open', 'remaining'
  sent_at timestamptz not null default now(),
  primary key (user_id, date, kind)
);
alter table public.notification_log enable row level security;
create policy "own rows: read" on public.notification_log for select using (user_id = auth.uid());

-- Server-only settings (e.g. the push signing keys). No policies: only the
-- server's secret key can read or write this table.
create table public.app_secrets (
  name text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;

-- Default: every reminder on. Users switch them off in Settings.
alter table public.profiles alter column notification_prefs
  set default '{"checkin": true, "window": true, "remaining": true, "water": true, "weighin": true}'::jsonb;
update public.profiles
  set notification_prefs = '{"checkin": true, "window": true, "remaining": true, "water": true, "weighin": true}'::jsonb || notification_prefs;
