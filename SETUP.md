# Putting Coś ty żarła online

About 30 minutes, once. Everything here is free. Keep a note open to paste values into as you go: you'll collect 5 of them.

| # | Value | Where you get it |
|---|---|---|
| A | Supabase project URL | Step 2 |
| B | Supabase publishable key | Step 2 |
| C | Google client ID | Step 3 |
| D | Google client secret | Step 3 |
| E | Your app's address (…vercel.app) | Step 4 |

---

## Step 1. GitHub (stores the code)

1. Create an account at **github.com** if you don't have one.
2. Click **+ → New repository**. Name it `cos-ty-zarla`, set it to **Private**, and don't add a README.
3. Send Claude the repository name, e.g. `your-username/cos-ty-zarla`. Claude pushes the code into it.

## Step 2. Supabase (database and sign-in)

1. Create an account at **supabase.com** and click **New project**.
   - Name: `cos-ty-zarla`
   - Database password: click *Generate*, then store it in your password manager (you won't need it day to day).
   - Region: **Central EU (Frankfurt)**.
2. Wait about 2 minutes for the project to be ready.
3. Open **SQL Editor → New query**. Paste the entire contents of `supabase/migrations/20261012000001_init.sql` and click **Run**. It should say *Success. No rows returned*.
4. In a new query, add the two Google addresses that may sign in (yours as admin), then **Run**:
   ```sql
   insert into public.allowed_emails (email, is_admin) values
     ('your.address@gmail.com', true),
     ('your.mate@gmail.com', false);
   ```
   Use lowercase. You can add or remove people later in the app under Settings.
5. Open **Project Settings → Data API** (or **API**). Copy the **Project URL**. That's **A**.
6. Open **Project Settings → API Keys**. Copy the **Publishable key** (starts with `sb_publishable_`). That's **B**.

## Step 3. Google sign-in

1. Go to **console.cloud.google.com**, sign in with your Google account, and create a new project called `cos-ty-zarla`.
2. Open **APIs & Services → OAuth consent screen** (may be called *Google Auth Platform*):
   - App name: `Coś ty żarła`; support email: yours.
   - Audience: **External**.
   - Under **Test users**, add both Gmail addresses from step 2.4. Leave the app in *Testing*. With test users, nothing needs Google's review.
3. Open **Credentials → Create credentials → OAuth client ID**:
   - Type: **Web application**
   - Authorized redirect URI: `https://<A without https://>/auth/v1/callback`
     e.g. `https://abcdefgh.supabase.co/auth/v1/callback`
4. Copy the **Client ID** (**C**) and **Client secret** (**D**).
5. Back in Supabase: **Authentication → Sign In / Providers → Google**. Turn it on, paste **C** and **D**, and **Save**.

## Step 4. Vercel (hosts the app)

1. Create an account at **vercel.com** using **Continue with GitHub**.
2. Click **Add New → Project** and import `cos-ty-zarla`.
3. Before deploying, open **Environment Variables** and add:
   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | **A** |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **B** |
4. Click **Deploy** and wait about 2 minutes.
5. Copy the address it shows, e.g. `https://cos-ty-zarla.vercel.app`. That's **E**.

## Step 5. Connect the address back to Supabase

In Supabase, open **Authentication → URL Configuration**:
- **Site URL:** **E**
- **Redirect URLs → Add URL:** `E/auth/callback`, e.g. `https://cos-ty-zarla.vercel.app/auth/callback`

Save.

## Step 6. Try it

1. Open **E** in Chrome on your phone and sign in with Google.
2. Go through the setup steps. At the end you'll see your daily target.
3. Chrome menu (⋮) → **Add to Home screen**. From now on it opens like an app.
4. Send **E** to your mate.

### If something goes wrong
- **"This Google account isn't on the list"**: the address in step 2.4 is missing or has a typo. Check it in Supabase → Table Editor → `allowed_emails`.
- **Google says "Access blocked" / "app not verified"**: the address isn't a *Test user* in step 3.2.
- **You land back on the login page after Google**: the redirect URL in step 5 is missing or doesn't match **E** exactly.
- Anything else: send Claude a screenshot.

---

# Reminders (push notifications)

About 10 minutes, once. Claude gives you a one-off scheduler password to use in steps 3 and 4.

## 1. Add the new tables
Supabase → **SQL Editor → New query**. Paste the contents of `supabase/migrations/20261012000002_notifications.sql` and click **Run**.

## 2. Give the app its server key
1. Supabase → **Project Settings → API Keys**. Under **Secret keys**, copy the key that starts with `sb_secret_` (click the eye or copy icon).
2. Vercel → your project → **Settings → Environment Variables → Add**:
   - Key: `SUPABASE_SECRET_KEY`, Value: the `sb_secret_…` key.

   This key is powerful: paste it only into Vercel, never into a chat or the code.

## 3. Add the scheduler password to Vercel
Same place, add one more:
- Key: `CRON_SECRET`, Value: the password Claude gave you.

Then redeploy so the app picks up both: **Deployments** → ⋯ on the top one → **Redeploy**.

## 4. Start the 5-minute clock
Supabase → **SQL Editor → New query**. Paste `supabase/schedule_notifications.sql`, replace `YOUR_CRON_SECRET` with the same password, click **Run**.
To pause it later: **Integrations → Cron → Jobs** → `send-reminders`.

## 5. Turn reminders on, on each phone
Open the app from its home-screen icon → **Settings → Reminders → Turn on reminders on this phone** → **Allow**. Tap **Send a test reminder** to check.

---

# AI meal estimates

About 10 minutes, once.

## 1. Add the new tables and photo storage
Supabase → **SQL Editor → New query**. Run each file, one at a time:
- `supabase/migrations/20261012000003_ai.sql`
- `supabase/migrations/20261012000004_photo_storage.sql`

## 2. Get a Claude API key
1. Go to **console.anthropic.com** and sign up.
2. **Billing**: add a card and buy **$5** of credit. With Haiku, two people typically spend under $1 a month.
3. **Limits**: set a monthly spend limit of **$10** as a backstop. The app also stops itself at $10 and alerts you at $5.
4. **API Keys → Create key**, name it `cos-ty-zarla`, and copy it (starts with `sk-ant-`). It's shown only once.

This key spends your money: paste it only into Vercel, never into a chat.

## 3. Add it to Vercel
Vercel → project → **Settings → Environment Variables → Add**:
- Key: `ANTHROPIC_API_KEY`, Value: the `sk-ant-…` key.

Then **Deployments** → ⋯ on the top one → **Redeploy**.

Optional: `AI_MODEL` switches the model later (e.g. `claude-sonnet-5-5` for better photo accuracy at ~20× the price).

---

# Watch sync (Galaxy Watch → Health Connect → app)

## 1. Add the new tables
Supabase → **SQL Editor → New query** → run `supabase/migrations/20261012000005_watch.sql`.

## 2. Let Samsung Health share with Health Connect (on the phone)
Samsung Health → **⋮ → Settings → Health Connect** → allow Samsung Health to write **Steps, Sleep, Active calories burned, Exercise**.

## 3. Install the companion app
App → **Settings → Zegarek → Połącz zegarek**. Note the 8-character code, then tap **Pobierz aplikację pomocniczą**.
Open the downloaded `cos-ty-zarla-sync.apk`; allow your browser to install apps when Android asks.

## 4. Connect
Open **Żarła Sync**, type the code, tap **Połącz**, then **Allow** all health data, including **access in the background**.
Tap **Synchronizuj teraz** to test. Settings → Zegarek should show "Ostatnia synchronizacja przed chwilą".

Updates: every change to the companion app publishes a new download at the same link; installing it replaces the old version and keeps the connection.

---

# Workouts and watch-only burn
Supabase → **SQL Editor** → run `supabase/migrations/20261012000006_workouts.sql`.

---

# Daily and weekly reports

## 1. Add the new tables
Supabase → **SQL Editor → New query** → run `supabase/migrations/20261014000007_reports.sql`.

## 2. Set up sending (pick one)

**Gmail (recommended, because both of you read mail in Gmail)**
1. Use the Google account that should send the reports (your own, or a new one just for the app).
2. Turn on 2-Step Verification: myaccount.google.com → Security.
3. Open myaccount.google.com/apppasswords, name it `cos-ty-zarla`, and click **Create**. Copy the 16-letter password.
4. Vercel → project → **Settings → Environment Variables** → add:
   - `GMAIL_USER` = that Gmail address
   - `GMAIL_APP_PASSWORD` = the 16-letter password (secret: never paste it anywhere else)
5. **Deployments → ⋮ → Redeploy**.

**Brevo (alternative)**
Sign up at brevo.com → Settings → Senders → add and verify your sender address → SMTP & API → API keys → generate.
In Vercel add `BREVO_API_KEY` and `EMAIL_FROM` (the verified address), then redeploy.
Note: Brevo can't authenticate a gmail.com sender, so mail to Gmail inboxes may land in spam.

Optional: `EMAIL_FROM_NAME` (default "Coś ty żarła").

## 3. Check
Settings → Dieta → **Raporty e-mail** no longer shows "not set up". The first daily report arrives the morning after a day with entries;
the weekly one right after the weigh-in on your weigh-in day (or at 21:00 without it). All reports also appear in Historia → Raporty.
