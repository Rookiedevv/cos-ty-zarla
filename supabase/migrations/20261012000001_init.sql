-- Coś ty żarła — Phase 1 schema
-- Every user table has row-level security: users only ever see their own rows.

-- ───────────────────────── Access control ─────────────────────────

create table public.allowed_emails (
  email text primary key check (email = lower(email)),
  is_admin boolean not null default false,
  added_at timestamptz not null default now()
);
alter table public.allowed_emails enable row level security;
-- No policies for regular users: only admins (below) and the service role can read it.

-- ───────────────────────── Profiles ─────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  is_admin boolean not null default false,

  -- body
  sex text check (sex in ('male', 'female')),
  date_of_birth date,
  height_cm numeric(5,1) check (height_cm between 120 and 230),
  lifestyle text check (lifestyle in ('sedentary', 'on_feet', 'physical')),
  burn_adjust numeric(4,3) not null default 1.000 check (burn_adjust between 0.7 and 1.3),

  -- goal: weekly loss as a fraction of body weight; null = recommended ("auto")
  pace numeric(5,4) check (pace is null or (pace > 0 and pace <= 0.02)),

  -- diet
  method text not null default 'none' check (method in ('none', 'if', 'five_two', 'montignac')),
  -- IF: {"preset":"16:8","start":"12:00","end":"20:00"}; 5:2: {"low_days":[1,4]} (ISO weekdays)
  method_config jsonb not null default '{}'::jsonb,
  food_focus text not null default 'balanced'
    check (food_focus in ('balanced', 'low_carb', 'mediterranean', 'high_protein', 'vegetarian')),

  -- routine
  timezone text not null default 'Europe/Warsaw',
  language text not null default 'pl' check (language in ('en', 'pl')),
  wake_time time not null default '07:30',
  last_meal_time time not null default '20:00',
  weigh_in_dow smallint not null default 1 check (weigh_in_dow between 1 and 7), -- ISO: 1 = Monday
  weigh_in_time time not null default '07:30',
  water_override_ml integer check (water_override_ml is null or water_override_ml between 500 and 6000),
  notification_prefs jsonb not null default '{}'::jsonb,

  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "own profile: read" on public.profiles for select using (id = auth.uid());
create policy "own profile: update" on public.profiles for update using (id = auth.uid())
  with check (id = auth.uid());

-- Users can't promote themselves to admin or change their identity fields.
create function public.protect_profile_fields() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.is_admin := old.is_admin;
    new.email := old.email;
    new.burn_adjust := old.burn_adjust; -- only changed by the weekly weigh-in job
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_fields();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create policy "admins manage allow-list" on public.allowed_emails for all
  using (public.is_admin()) with check (public.is_admin());

-- ───────────────── Sign-up gate: only allow-listed emails ─────────────────
-- Runs when Supabase Auth creates a user. Raising here makes the sign-in fail,
-- so people who are not on the list never get an account.

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  allowed public.allowed_emails;
begin
  select * into allowed from public.allowed_emails where email = lower(new.email);
  if not found then
    raise exception 'EMAIL_NOT_ALLOWED: % is not on the allow-list', new.email
      using errcode = 'P0001';
  end if;

  insert into public.profiles (id, email, display_name, is_admin)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    allowed.is_admin
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── Body weight ─────────────────────────

create table public.weights (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  date date not null,
  kg numeric(5,1) not null check (kg between 30 and 300),
  created_at timestamptz not null default now(),
  unique (user_id, date)
);
create index on public.weights (user_id, date desc);

-- ───────────────────────── Morning check-in ─────────────────────────

create table public.checkins (
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  date date not null,
  sleep_hours numeric(3,1) check (sleep_hours between 0 and 16),
  sleep_source text not null default 'manual' check (sleep_source in ('manual', 'watch')),
  planned_activity text not null check (planned_activity in ('rest', 'light', 'moderate', 'hard')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- ───────────────────────── Daily targets (snapshot) ─────────────────────────
-- Recalculated whenever something affecting the day changes. Stored so history
-- and the carry-over rule can see what each day's target actually was.

create table public.daily_targets (
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  date date not null,
  pre_carry_target integer not null,
  final_target integer not null,
  breakdown jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- ───────────────────────── Meals ─────────────────────────

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  eaten_at timestamptz not null,
  -- local calendar date the meal counts toward (in the user's time zone at logging time)
  eaten_date date not null,
  logged_at timestamptz not null default now(),
  description text not null check (char_length(description) between 1 and 2000),
  source text not null default 'manual' check (source in ('manual', 'ai_text', 'ai_photo', 'barcode')),
  photo_path text,            -- Phase 2; deleted after 90 days, description stays
  ai_draft jsonb,             -- Phase 2
  verdict text,               -- Phase 3
  total_kcal integer not null check (total_kcal between 0 and 10000),
  protein_g numeric(6,1) check (protein_g is null or protein_g >= 0),
  outside_window boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.meals (user_id, eaten_date desc);

create table public.meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  position smallint not null default 0,
  name text not null check (char_length(name) between 1 and 200),
  amount numeric(7,1),
  unit text check (unit in ('g', 'ml', 'pcs')),
  kcal integer not null check (kcal between 0 and 10000),
  protein_g numeric(6,1),
  barcode text,
  source text not null default 'manual' check (source in ('manual', 'ai', 'barcode'))
);
create index on public.meal_items (meal_id);

-- ───────────────────────── Water ─────────────────────────

create table public.water_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  at timestamptz not null default now(),
  date date not null,
  ml integer not null check (ml between -2000 and 3000 and ml <> 0)
);
create index on public.water_logs (user_id, date);

-- ───────────────────────── Own-rows policies ─────────────────────────

do $$
declare t text;
begin
  foreach t in array array['weights', 'checkins', 'daily_targets', 'meals', 'meal_items', 'water_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- A meal item must belong to a meal owned by the same user.
create function public.check_meal_item_owner() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from public.meals m where m.id = new.meal_id and m.user_id = new.user_id) then
    raise exception 'meal item does not match meal owner';
  end if;
  return new;
end $$;
create trigger meal_items_owner before insert or update on public.meal_items
  for each row execute function public.check_meal_item_owner();

-- Keep updated_at current.
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger meals_touch before update on public.meals for each row execute function public.touch_updated_at();
create trigger checkins_touch before update on public.checkins for each row execute function public.touch_updated_at();
create trigger targets_touch before update on public.daily_targets for each row execute function public.touch_updated_at();

-- Daily totals used by the Today screen, history and the carry-over rule.
create view public.daily_intake with (security_invoker = true) as
  select user_id, eaten_date as date, sum(total_kcal)::integer as kcal, sum(protein_g) as protein_g, count(*)::integer as meals
  from public.meals
  group by user_id, eaten_date;
