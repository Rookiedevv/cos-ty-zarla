# Coś ty żarła — Product & Technical Specification (v1)

> A private calorie, fasting and habit tracker for two people, with AI-assisted meal logging and smartwatch-aware daily targets.

**Status:** Reviewed defaults, v1.1 · **Date:** 2026-10-12 · **Owner:** Robert

---

## 1. Goals

1. Help two people lose weight **at a pace they choose, defaulting to the fastest that is still healthy and sustainable**, with no goal weight required.
2. Make logging fast: snap a photo (or describe the meal), let AI estimate it, then confirm or correct it.
3. Support different eating **methods** (e.g. intermittent fasting) and **food focuses** (e.g. keto) per person.
4. Adapt the daily calorie target to sleep and activity, using smartwatch data automatically when available.
5. Keep both people motivated with a light, non-intrusive view of each other's weekly trends.

### Non-goals (v1)
- Public sign-up, more than a handful of users, or app store distribution.
- iOS companion app or Apple Watch / Apple Health (planned for later; the architecture must allow it).
- Full macro tracking (only protein, and only when the "High-protein" focus is selected).
- Medical advice. The app gives general guidance and always shows estimates as estimates.

---

## 2. Users

| User | Device | Watch | Method (initial) |
|---|---|---|---|
| Robert (admin) | Android (may switch to iPhone later) | Samsung Galaxy Watch | Intermittent fasting |
| Mate | Android | None | Their own choice |

- Access is **invite-only**. Only Google accounts on an admin-managed allow-list can sign in.
- Robert is the **admin**. He manages the allow-list and receives the cost alerts.

---

## 3. Platform & Architecture

```
┌──────────────────────┐      ┌───────────────────────────────┐
│  Web app (PWA)       │◄────►│ Supabase (free tier)          │
│  Next.js + TS        │      │  • Postgres + Row-Level Sec.  │
│  Vercel (free)       │      │  • Auth (Google OAuth)        │
│  phone + desktop     │      │  • Storage (meal photos)      │
└─────────┬────────────┘      │  • Edge Functions             │
          │ server routes     │  • pg_cron (every 5 min)      │
          ▼                   └──────┬──────────────┬─────────┘
   ┌──────────────┐                  │              │
   │ Claude API   │◄─────────────────┘              ▼
   │ Haiku 5.5    │                         ┌───────────────┐
   └──────────────┘                         │ Web Push      │ → phone notifications
                                            │ Resend (email)│ → weekly summary, cost alerts
┌──────────────────────┐                    └───────────────┘
│ Android companion    │── sleep, steps, active kcal, workouts ──► Supabase
│ (Kotlin, Health      │   (reads Health Connect, which Samsung
│  Connect, WorkManager)│    Health syncs into)
└──────────────────────┘
```

| Concern | Choice | Notes |
|---|---|---|
| Frontend | Next.js (App Router), TypeScript, Tailwind | Installable PWA, works on phone and desktop |
| Hosting | Vercel Hobby (free) | |
| DB / Auth / Storage | Supabase free tier | Google OAuth, RLS on every table |
| Scheduling | Supabase `pg_cron` + Edge Function every 5 min | Drives notifications, live target updates, weekly summaries |
| Push | Web Push (VAPID) | Works on Android Chrome once the PWA is installed |
| Email | Resend (free tier) | Weekly summaries, cost alerts |
| AI | Claude API, `claude-haiku-5-5` | One shared API key, stored server-side only. Model is configurable so it can be switched to Sonnet later |
| Barcodes | Client-side decoding from the photo (ZXing), lookup in Open Food Facts | Free, good Polish coverage |
| Watch sync | Android companion app, Health Connect, background sync every ~15–30 min | Optional per user. Data-source layer is pluggable, so an iOS/HealthKit source can be added later |
| Languages | English and Polish, switchable per user | AI replies in the user's language |
| Units | Metric (kg, cm, ml, kcal) | |

**Expected running cost:** about $0.30–0.60/month for AI (both users combined). Everything else runs on free tiers.

---

## 4. Onboarding (per user)

1. Sign in with Google (must be on the allow-list).
2. Choose language (EN/PL).
3. Profile: sex, date of birth, height, current weight, typical daily activity (job: sedentary / on feet / physical).
4. **Pace** (section 5.2): suggested options with kg/week for this person.
5. **Method** and **Food focus** (section 6), each with an explanation hint.
6. If the method is IF: pick a preset or custom window.
7. Weekly weigh-in day and time.
8. Water target: the suggested value is shown and can be changed.
9. Notifications: enable push, then toggle each type.
10. Optional: connect the watch (opens the instructions for installing the companion app).
11. Summary screen: "Your starting daily target is X kcal; expected loss is ~Y kg/week."

All of these can be changed later in Settings.

---

## 5. Calorie Target Engine

### 5.1 Baseline
- **BMR:** Mifflin–St Jeor.
- **Base burn (no exercise):** BMR × lifestyle factor (sedentary 1.2 / on feet 1.35 / physical 1.5).
- **Adaptive correction:** after each weekly weigh-in, the app compares actual weight change with predicted change and nudges the person's personal burn estimate (max ±5% per week, smoothed). This is how it learns "how the body reacted".

### 5.2 Pace (no goal weight)
Each user **chooses their pace**. The app suggests options and shows, every day, what the chosen pace means.

- **Recommended (default):** the largest deficit within all healthy limits:
  - weekly loss ≤ **1% of current body weight**,
  - daily deficit ≤ **25% of that day's total burn**, and ≤ **1,000 kcal**.
- **Other options:** Easy 0.5%/week, Steady 0.75%/week, 1%/week, 1.25%/week, 1.5%/week, or a custom value up to 2%/week.
- Picking a pace beyond the healthy limits is **allowed**, with a clear warning saying which limit is exceeded and what that means.
- **Hard floor (cannot be overridden):** the daily target never goes below **1,500 kcal (men) / 1,200 kcal (women)**. If the chosen pace would go lower, the target stops at the floor and the app says so.
- **Daily information:** the Today screen shows the pace in use and what it means today: "~0.53 kg/week at today's target".
- **Maintenance switch:** when BMI reaches **20**, the deficit stops, the target becomes maintenance, and the user is told why.

The 5:2 method is the one exception to the floor (section 6.1).

### 5.3 Daily flow
1. **Morning check-in** (2 taps):
   - *Sleep last night:* prefilled from the watch if connected, otherwise picked by the user (<5h / 5–6h / 6–7h / 7–8h / 8h+).
   - *Planned activity today:* rest / light / moderate / hard (with examples like "45 min run = hard").
2. The target is calculated from base burn + planned activity − deficit, then adjusted:
   - **Short sleep (<6h):** the deficit is reduced by 10% for the day, with a tip. Short sleep raises hunger, and a slightly easier day protects adherence.
   - **Carry-over** from earlier overages (5.4).
3. **Live adjustment (watch users):** as active calories arrive from the watch, planned activity is replaced by actual activity whenever actual differs, and the target moves up or down. The change is shown, e.g. "+180 kcal from your afternoon walk".
4. Users without a watch keep the planned-activity target. They can edit today's activity at any time.
5. **No assumptions are made if the check-in is missing.** Until the user checks in (or explicitly marks the day as a rest day), today's target is shown as **provisional** (calculated as a rest day, clearly labelled), and the app keeps reminding (11.).

### 5.4 Overages and late eating
- Calories always count toward the **day they were eaten** (time comes from "when did you eat it?").
- If a day ends over target, the overage is spread over the next days: **at most 10% of each day's target, for at most 3 days, never below the safety floor**. Anything left beyond that is dropped. There is no "pay it back" punishment.
- The fasting clock restarts from the **last intake**, but the planned eating window for the next day does **not** shift.
- Tone is neutral and factual: "Logged. Tomorrow's target is 1,850 kcal." There are no streak-shaming messages.
- For alcohol, calories are logged as usual, plus a one-line note that alcohol pauses fat burning for a while.

---

## 6. Diet Model (two independent choices)

Each choice has an **info hint** (what it is, who it suits) and a **cheatsheet** (focus on / avoid) that is always reachable from the home screen.

### 6.1 Method (when and how you eat)
| Method | Behaviour in the app |
|---|---|
| None | No window. User sets a "last meal by" time (default 20:00), used for reminders |
| Intermittent fasting | Presets 16:8, 18:6, 20:4, or a custom start/end. Fasting timer, window notifications |
| 5:2 | User picks 2 low days a week (500 kcal women / 600 kcal men). Other days get a normal deficit, with the weekly average checked against 5.2 |
| Montignac | Low-glycemic approach. Meals are checked for high-GI foods and white-flour/sugar combinations |

### 6.2 Food focus (what you eat)
| Focus | App behaviour |
|---|---|
| Balanced | No restrictions; gentle nudges toward protein and vegetables |
| Low-carb / Keto | Flags bread, pasta, rice, potatoes, sugar, beer, sweet drinks |
| Mediterranean | Flags processed meat, fast food, sweets, excess red meat |
| High-protein | Shows a daily protein target (1.6 g/kg) and flags low-protein meals |
| Vegetarian | Flags meat and fish |

### 6.3 Diet compliance feedback
After every confirmed meal, the AI adds a **one-line verdict** on how the meal fits the user's method and focus. When the meal clearly breaks the chosen diet (e.g. pizza on keto), the verdict is **firm and direct** ("This doesn't fit keto: the dough alone is ~80 g carbs."). It is never insulting, and it is shown only once per meal.

---

## 7. Meal Logging

### 7.1 Photo flow (primary)
1. User takes or uploads a photo.
2. **Client-side barcode scan** of the photo. If a barcode is found, the product is fetched from Open Food Facts and its exact values are used for that item.
3. Photo, barcode data, user diet and language go to Haiku. It returns structured JSON with:
   - items (name, estimated portion in g/ml, kcal, protein, confidence),
   - up to 3 **clarifying questions** when confidence is low (e.g. "Was the sauce cream-based?", "How much of it did you eat?").
4. The user answers the questions, and the estimate is updated.
5. **The draft is always shown as an estimate:** "This looks like: chicken breast ~150 g (250 kcal), rice ~200 g (260 kcal)…"
6. The user can **edit anything**: rename, change portion, change kcal, remove or add items.
7. **"When did you eat this?"** Default is *now*, with quick picks (30 min ago, 1h, 2h, 3h) and an exact time option.
8. Confirm → saved. Nothing is saved without confirmation.

### 7.2 Text flow (no photo)
- The user describes the meal ("two eggs, toast with butter, coffee with milk").
- Same pipeline. If the description is too vague, the AI asks follow-up questions until it can give a reasonable estimate (max 3 rounds), then shows the editable draft.

### 7.3 Recipe calculator (Przepis tab)
- The user types or dictates (🎤, browser speech recognition, Polish) the ingredients and how the dish was cooked, and picks the number of portions (1–12).
- One AI call returns the whole dish's ingredients with amounts and kcal, accounting for cooking (frying fat, dry vs cooked weight), plus a short note of the biggest guesses.
- Shows kcal per portion, the whole dish total and the ingredient list. Changing portions recalculates without a new AI call.
- v1 saves nothing (no meal, no recipe); only the AI cost goes to `ai_usage` (purpose `recipe`) and counts toward the monthly limit.

### 7.4 Other
- **Water:** quick-add buttons (+250 / +500 ml, custom).
- Edit or delete any past entry.
- **Photo retention:** photos are deleted after 90 days. The meal's text description (the user's own text or the AI's description of the photo) and all logged items and values are kept permanently.

---

## 8. Water

- Default target: **33 ml per kg body weight**, plus 500 ml per hour of logged or watch-recorded exercise.
- User can **override the base target** (e.g. lower, if the default is too much for them).
- Progress ring on the home screen.

---

## 9. Weekly Weigh-in & Summary

- Each user sets their weigh-in **day and time**. A reminder is sent then.
- After the weight is entered, the system:
  1. updates the adaptive burn estimate (5.1),
  2. generates the **weekly summary** (Haiku) and **emails it** to that user right away.
- If no weight is entered by end of that day, the summary is sent anyway, marked "no weigh-in this week".

**Summary contents:** weight change (week and total), average sleep, exercise (minutes, active kcal), days within target, fasts completed (if IF), water consistency, and a short **"What went well / What didn't"** section in plain language. Suggestions for next week are limited to 1–2 concrete changes.

---

## 10. Partner View (non-intrusive)

Each user sees a **small card** for the other person:
- Weekly trend arrows for **sleep**, **exercise**, and **weight change** (kg change only, never absolute weight).
- A 1–2 line version of the other person's latest weekly "went well / didn't".

The partner view never shows individual meals, photos, daily calories, or absolute weight.

---

## 11. Notifications (Web Push)

All are on by default, and each can be toggled per user.

| Notification | When |
|---|---|
| Morning check-in | At wake time (user setting, default 07:30) if not done; repeated at 12:00 and 16:00 while still missing |
| Eating window opens | At window start (IF) |
| Eating window closes soon | 30 min before window end (IF) |
| Remaining intake | **2h before window end** (IF) or 2h before "last meal by" (others): "~640 kcal left today" |
| Water | Mid-afternoon, if below 50% of target |
| Weigh-in | On the user's weigh-in day and time |

Notifications are only sent when there is **something to do**: no motivational spam, and no notification if the action is already done.

---

## 12. AI Cost Control

- Every AI call logs model, tokens in/out, and calculated cost per user.
- **$5 in a calendar month:** email to the admin (Robert). AI keeps working.
- **$10 in a calendar month:** hard stop. AI features are disabled until the next month. Manual entry and barcode logging still work, and the UI explains why.
- Admin page shows month-to-date cost per user.
- Backstop: a spending limit is also set in the Anthropic Console.

---

## 13. Smartwatch Integration (optional per user)

- **Android companion app** (Kotlin, minimal UI): sign in, grant Health Connect permissions, show sync status.
- Samsung Health → Health Connect (user enables this in Samsung Health settings) → companion app reads **sleep sessions, steps, active calories, exercise sessions** → uploads to Supabase in the background every ~15–30 minutes.
- The web app shows "Watch data last synced: 12 min ago".
- Installed from an APK file (no Play Store).
- The data-source layer is generic (`source = health_connect | manual | healthkit`), so a future iOS/HealthKit app can plug in without changes to the target engine.

---

## 14. Screens

1. **Home / Today:** calorie ring (eaten / target / left), fasting timer or window status, water ring, today's meals, "+ Log meal" button, partner card.
2. **Log meal:** camera/upload or text → questions → editable draft → time → confirm.
2a. **Recipe (Przepis):** ingredients + method by text or voice → portions → kcal per portion.
3. **Morning check-in:** sleep + planned activity.
4. **History:** calendar of days, each with totals; tap to see meals.
5. **Trends:** weight (weekly points), sleep, exercise, calories vs target.
6. **Diet guide:** method and focus explanations and cheatsheets.
7. **Settings:** profile, diet, window, water target, weigh-in day, notifications, language, watch connection.
8. **Admin** (Robert only): allow-list, AI cost per user.

---

## 15. Data Model (summary)

- `profiles`: user_id, sex, dob, height_cm, lifestyle, language, method, method_config, food_focus, water_override_ml, weigh_in_dow/time, wake_time, notification prefs, is_admin
- `allowed_emails`
- `weights`: user_id, date, kg
- `checkins`: user_id, date, sleep_hours, sleep_source, planned_activity
- `health_samples`: user_id, type (sleep/steps/active_kcal/exercise), start, end, value, source
- `daily_targets`: user_id, date, base_burn, activity_kcal, deficit, carryover, target_kcal, explanation
- `meals`: user_id, eaten_at, logged_at, photo_path, input_text, ai_draft (json), verdict, total_kcal, protein_g
- `meal_items`: meal_id, name, amount, unit, kcal, protein_g, barcode, source (ai/barcode/manual)
- `water_logs`: user_id, at, ml
- `fasts`: user_id, start, end, planned_hours, completed
- `weekly_summaries`: user_id, week_end, stats (json), went_well, didnt, partner_snippet
- `ai_usage`: user_id, at, model, tokens_in, tokens_out, cost_usd, purpose
- `push_subscriptions`

RLS: users read and write only their own rows. Partner access goes only through a view exposing `weekly_summaries.partner_snippet` and trend aggregates.

---

## 16. Build Plan

| Phase | Scope | Result |
|---|---|---|
| 1 | Project setup, auth + allow-list, onboarding, profile, target engine (manual check-in), manual text logging | Usable calorie tracker |
| 2 | AI logging (photo + text + questions), barcode from photo, editable drafts, cost tracking + caps | Core experience |
| 3 | Methods & focuses, fasting timer, diet verdicts, cheatsheets, water | Diet features |
| 4 | Web push notifications, weigh-in, adaptive burn, weekly summary emails, partner card, trends | Habit loop |
| 5 | Android companion app + live target adjustment | Watch integration |
| 6 | Polish (EN/PL), testing, deployment guide | v1 done |

Each phase ends with a working, deployed build.

---

## 17. What You'll Need to Set Up (one-time, ~30 min, with step-by-step guide)

- GitHub, Vercel, Supabase, Resend accounts (all free).
- Google Cloud OAuth client (for Google sign-in).
- Anthropic Console account with ~$5–10 prepaid credit and a spending limit.
- On your phone: enable Health Connect sync in Samsung Health, install the companion APK.

---

## 18. Confirmed Defaults

| Decision | Value |
|---|---|
| App name | Coś ty żarła |
| Pace | User-chosen; default = recommended (≤ 1%/week, ≤ 25% of burn, ≤ 1,000 kcal); harder allowed with warnings |
| Hard floor | 1,500 kcal (men) / 1,200 kcal (women) |
| Short sleep (<6h) | Deficit −10% that day |
| Overage carry-over | ≤ 10% of daily target, ≤ 3 days, never below floor; rest forgiven |
| Missed check-in | No assumption; provisional target + reminders until check-in or explicit rest day |
| Water | 33 ml/kg + 500 ml per hour of exercise; user can override |
| Photos | Deleted after 90 days; descriptions and values kept |
| Maintenance switch | At BMI 20 |
| Weekly summary | Emailed to each user's Google email after weigh-in |
