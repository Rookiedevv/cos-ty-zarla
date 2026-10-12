# Coś ty żarła

Private calorie, fasting and weekly weigh-in tracker for two people. See `SPEC.md` for what it does and `SETUP.md` for putting it online.

## Stack
Next.js 16 (App Router) · TypeScript · Tailwind 4 · Supabase (Postgres + RLS, Google auth) · Vercel.

## Layout
- `src/lib/engine/`: the calorie engine (pure functions, no I/O). All tunable numbers are in `constants.ts`.
- `src/lib/day.ts`: loads a day's data and stores its target snapshot.
- `src/app/actions.ts`: every write, validated with zod and protected by RLS.
- `src/lib/i18n/`: Polish and English text.
- `supabase/migrations/`: database schema, RLS and the allow-list sign-up gate.
- `supabase/tests/`: security tests that run on plain Postgres.

## Commands
```bash
npm run dev        # local dev (needs .env.local, see .env.example)
npm test           # calorie engine tests
npm run build
```

Database tests need a local Postgres 16:
```bash
createdb t && psql -d t -f supabase/tests/stub_supabase.sql \
  -f supabase/migrations/20261012000001_init.sql -f supabase/tests/rls_test.sql
```

## Build phases
1. ✅ Auth + allow-list, onboarding, pace, calorie engine, check-in, manual logging, water, weight, history
2. AI meal logging (photo + text), barcode, cost caps
3. Diet methods & cheatsheets, fasting timer, verdicts
4. Notifications, adaptive burn, weekly summary emails, partner card, trends
5. Android companion app (Health Connect)
6. Polish & hardening
