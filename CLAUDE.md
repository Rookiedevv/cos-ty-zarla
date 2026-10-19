# CLAUDE.md — handover for "Coś ty żarła"

Read this first in every session. Also read `AGENTS.md` (Next.js 16 rule), `SPEC.md` (product spec) and `SETUP.md` (one-time setup steps per feature).

## What this is
A private calorie + intermittent-fasting tracker for two friends (Robert = admin, and his mate). Polish first, English switchable.
Live at https://cos-ty-zarla.vercel.app. Invite-only (Google login + allow-list).

## How to work with Robert (important)
- **Never start coding or pushing without an explicit go-ahead** ("build it", "yes", "push"). When he reports a problem, examine it, explain the cause and propose a fix, then ask.
- **Ask questions one at a time, with clickable options** (AskUserQuestion). He doesn't want to type answers. Put a "(Recommended)" option first.
- When he asks "what do you think is best?", **answer with your recommendation in plain text first**, then offer the buttons.
- **For any manual step** (Supabase, Vercel, Google), go **one step at a time** and give **direct links and ready-to-paste content** (full SQL, exact values). Never make him look up a file on GitHub.
- He prefers the fewest steps on his side.
- **He is often on his phone.** Never ask him to run diagnostics (SQL, logs, dashboards) to find a bug. Work it out from the code, fix the likely causes, and build in-app visibility (e.g. a clear reason in the UI or email) instead. Ask for a manual step only when a change truly can't ship without it (e.g. a migration), and say if it needs a computer.
- **Secrets never go in chat or the repo.** They only go in Vercel env vars: ANTHROPIC_API_KEY, SUPABASE_SECRET_KEY, GMAIL_APP_PASSWORD, CRON_SECRET. The repo is **public**.
- Be honest about uncertainty: say what you verified and what you couldn't.
- Commit messages: imperative summary + short body.

## Links (give Robert these directly)
- App: https://cos-ty-zarla.vercel.app (settings: `/settings?tab=diet` or `?tab=account`)
- Supabase SQL editor: https://supabase.com/dashboard/project/zzxspnqrgvjetqwgvvzc/sql/new
- Supabase project: https://supabase.com/dashboard/project/zzxspnqrgvjetqwgvvzc
- Vercel env vars: https://vercel.com/roberts-projects-4ac7fc7c/cos-ty-zarla/settings/environment-variables
- Vercel deployments (Redeploy here): https://vercel.com/roberts-projects-4ac7fc7c/cos-ty-zarla/deployments
- GitHub: https://github.com/Rookiedevv/cos-ty-zarla (watch app: https://github.com/Rookiedevv/cos-ty-zarla/releases/latest/download/cos-ty-zarla-sync.apk)
- Gmail app passwords (signed in as costyzarla@gmail.com): https://myaccount.google.com/apppasswords
- Claude API keys/billing: https://console.anthropic.com

## Stack
- Next.js 16 App Router (`src/proxy.ts` replaces middleware; check `node_modules/next/dist/docs/` before using APIs), React 19, TypeScript, Tailwind 4 with CSS-variable tokens in `src/app/globals.css` (clean white + blue palette, dark-mode variant; token names tile/enamel/ink/kompot/good/mustard/water/accent are historical).
- Supabase: Postgres + RLS (own-rows policies), Google OAuth, allow-list trigger `handle_new_user`, Storage bucket `meal-photos`, pg_cron + pg_net calling `POST /api/cron/notify` every 5 min with `Bearer CRON_SECRET`.
- Server actions in `src/app/actions.ts` (zod-validated). Admin client (`SUPABASE_SECRET_KEY`) only for cron, AI usage, pairing, reports, and reading other people's names.
- AI: `@anthropic-ai/sdk`, model `claude-haiku-5-5` (override `AI_MODEL`), structured output via `output_config.format` json_schema. Costs go to `ai_usage`; alerts at $5 and a hard stop at $10/month (`src/lib/ai/budget.ts`, `alerts.ts`).
- Push: web-push, VAPID keys auto-created in the `app_secrets` table; service worker `public/sw.js`.
- Email: `src/lib/email.ts`. Gmail SMTP via app password (`GMAIL_USER`=costyzarla@gmail.com, `GMAIL_APP_PASSWORD`), Brevo as a fallback. Gmail chosen because the recipients use Gmail.
- Android companion "Żarła Sync" (`android/`, Kotlin, Health Connect, WorkManager every 15 min), built by `.github/workflows/android.yml` and published as GitHub release `sync-N`, asset `cos-ty-zarla-sync.apk`. The signing keystore is committed (`android/keystore/release.jks`, alias `costyzarla`).

## Env vars (Vercel)
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, CRON_SECRET, ANTHROPIC_API_KEY, (AI_MODEL), GMAIL_USER, GMAIL_APP_PASSWORD, (EMAIL_FROM_NAME, BREVO_API_KEY, EMAIL_FROM, NEXT_PUBLIC_COMPANION_APK_URL).
After changing any of them: Vercel → Deployments → ⋮ → Redeploy.

## Database migrations
`supabase/migrations/*.sql`, run **by hand** in the Supabase SQL editor, in order (000001 … 000008 so far, all applied).
A new migration = give Robert the full SQL to paste plus the editor link (`https://supabase.com/dashboard/project/<ref>/sql/new`; the ref is in NEXT_PUBLIC_SUPABASE_URL).
RLS tests in `supabase/tests/*.sql` run on a plain local Postgres with `stub_supabase.sql` (skip the storage migration locally).

## Calorie engine (`src/lib/engine/`)
- BMR: Mifflin–St Jeor.
- **With a watch** (fresh sync, ≤6 h): burn = BMR×1.1 + watch active kcal. No lifestyle factor, no planned workouts.
- **Without a watch**: burn = BMR × lifestyle (1.2 / 1.35 / 1.5) + planned workouts, (MET−1)×kg×h. Workouts come from quick picks or an AI "other" estimate.
- Deficit: pace chosen by the user (presets), with a hard floor of 1500 kcal (men) / 1200 (women) and warnings above 1%/week, 25% of burn or 1000 kcal.
- Short sleep (<6 h) cuts the deficit by 10%. Carry-over ≤10%/day for 3 days. Maintenance at BMI 20. 5:2 low days are 500/600 kcal.

## Features (all live)
- Today: target with breakdown, morning check-in (sleep + workout plan, or rest day), meals, water, weigh-in, diet reminder card.
- Meal logging: photo/barcode/text → AI estimate with up to 3 rounds of follow-up questions → editable items → save. Photos are deleted after 90 days; descriptions are kept.
- Recipe calculator ("Przepis" tab, `/recipe`, tabs Nowy / Zapisane; `src/components/recipe-flow.tsx`, `saved-recipes.tsx`, `src/lib/ai/recipe.ts`): text or dictated ingredients + method (🎤 via Web Speech API, `src/lib/client/dictation.ts`; hidden when unsupported) → portions → kcal and estimated cooked grams per portion → optional "Zapisz przepis". AI cost logged as purpose `recipe`.
- Saved recipes (`recipes` table, migration 000008): **shared**. Everyone reads all, only the owner renames/deletes (RLS). Each person can hide others' recipes (`recipe_hides`); hidden ones sit under "Ukryte". Owner names via admin client (`src/lib/recipes-server.ts`).
- Meal from a recipe: on `/log`, "Własny posiłek" / "Z przepisu". The chosen recipe (per-portion kcal, protein, cooked grams, ingredients) is sent to the meal AI as the reference; the AI judges how much was eaten from the photo/text and returns the recipe as one item plus any extras. `meals.recipe_id` (set null if the recipe is deleted). AI purpose `meal_recipe`.
- Meals and workouts: tap to expand (full name, items, AI verdict, delete).
- Share today's meals: "Udostępnij" button in Today → Posiłki (`src/components/share-day-button.tsx`, `src/lib/client/day-image.ts`). Draws a PNG on a canvas in the browser (app font, meals with items, total vs target) and opens the phone's share menu (Web Share API with files); falls back to downloading. No server, no AI.
- History tabs: Posiłki (30 days, kcal vs target with a coloured dot, accordion per day), Waga (chart + list + delete), Raporty.
- Settings tabs: **Dieta** (weight, plan form, report emails + test button, follow a friend, cheatsheets) and **Konto i aplikacja** (reminders, watch, AI costs [admin], allow-list [admin], sign out). Keep this split.
- Push reminders: check-in ×3, eating window open/closing, kcal left 2 h before last meal, water at 15:00, weigh-in (+ a second nudge at 17:00).
- Reports (`src/lib/reports/`):
  - Daily email at wake time about yesterday, only if something was logged: kcal vs target, meals, water, AI praise/critique.
  - Weekly email on each person's own weigh-in day, right after the weight is logged (or at 21:00 without it): progress, diet fit, sleep if short, suggestions.
  - Followers (the followed person must approve) get a simplified weekly email.
  - All reports are stored in the `reports` table and shown in History → Raporty.
  - AI comment (`src/lib/reports/ai.ts`): up to 3 tries per run (cut-off answers retried with 2× tokens; daily 1500, weekly 2500). On a passing failure the email **waits** and the next cron runs retry (`AI_RUNS` = 3, state in `reports.data.aiFailure/aiTries`); then it's sent with a reason-specific line (limit / AI refused / service down). History shows "still on its way" meanwhile.
- Loading states: Button `loading` prop, `LongWait` progress card + 45 s timeout/retry for AI, `loading.tsx` skeletons, `TabLink`/`NavPending`, optimistic deletes/water/switches.

## Open issues / ideas (ask before doing any)
- **Watch sleep shows "0 min snu".** Either Samsung Health isn't writing Sleep to Health Connect, or `HealthReader.kt` reads the aggregate badly. Proposed: read SleepSessionRecords (main sleep ending this morning, minus awake stages), add a diagnostic line in Żarła Sync, distinguish "no data" from 0, and use watch sleep even after check-in. Waiting for Robert to check Health Connect → Sen.
- Undecided: keep the AI cost panel? Add a "clear my data" button?
- Recipe ideas for later: edit the ingredients of a saved recipe, quick-log "1 portion" without AI, show in History which meals came from a recipe.
- Not built yet: fasting timer, 5:2 weekly check, adaptive burn from weigh-ins (`burn_adjust`), trends screen, editing a saved meal, cost alerts by email (sender now exists).
- Report emails land in Spam at first; users mark "Not spam" and add the sender to contacts.

## Checks before pushing
`npx tsc --noEmit -p . && npx eslint src && npx vitest run && npx next build`. Don't run prettier (not used in this repo).
Push to `main`. Vercel deploys automatically; check with `gh api repos/Rookiedevv/cos-ty-zarla/commits/<sha>/statuses`.
