-- Coś ty żarła — daily and weekly reports, following a friend's weekly progress

-- Every report that was generated. Written only by the server; each person reads their own.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('daily', 'weekly')),
  period_start date not null,
  period_end date not null,          -- daily: the day itself; weekly: the day before the weigh-in day
  data jsonb not null,               -- numbers and lists the report shows
  ai jsonb,                          -- AI comment (null when AI was paused or failed)
  emailed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, kind, period_end) -- one report per period, even if two jobs race
);
create index on public.reports (user_id, created_at desc);
alter table public.reports enable row level security;
create policy "own rows: read" on public.reports for select using (user_id = auth.uid());

-- Email switches. Missing key = on.
alter table public.profiles add column email_prefs jsonb not null default '{}'::jsonb;

-- Following someone's weekly progress. The followed person must approve.
create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  followee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
alter table public.follows enable row level security;
-- Both sides see the link.
create policy "either side reads" on public.follows for select
  using (follower_id = auth.uid() or followee_id = auth.uid());
-- Only the follower asks, and only as a request.
create policy "follower requests" on public.follows for insert
  with check (follower_id = auth.uid() and status = 'pending' and approved_at is null);
-- Either side can end it at any time.
create policy "either side removes" on public.follows for delete
  using (follower_id = auth.uid() or followee_id = auth.uid());
-- No update policy: approving goes through the function below, so nobody can approve their own request.

create function public.approve_follow(p_follower uuid) returns void
language sql security definer set search_path = public as $$
  update public.follows set status = 'approved', approved_at = now()
  where follower_id = p_follower and followee_id = auth.uid() and status = 'pending';
$$;
revoke all on function public.approve_follow(uuid) from public;
grant execute on function public.approve_follow(uuid) to authenticated;
