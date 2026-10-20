import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadDay } from "../day";
import { sendEmail } from "../email";
import { addDays, localDate, localTime } from "../engine/dates";
import { waterTargetMl } from "../engine/target";
import { siteUrl } from "../notify/push";
import { hhmm, isoWeekday, minutesOf, type EmailPrefKey, type Profile } from "../profile";
import { dailyComment, weeklyComment } from "./ai";
import { AI_RUNS, dayWasLogged, summarizeWeek, weekFor, type AiStatus, type DailyData, type WeeklyData } from "./build";
import { renderDaily, renderFriend, renderWeekly } from "./email";

/** The weekly report goes out at this local time even without a weigh-in. */
export const WEEKLY_FALLBACK = "21:00";

const wants = (p: { email_prefs: Profile["email_prefs"] }, key: EmailPrefKey) => (p.email_prefs ?? {})[key] !== false;
export const displayName = (p: { display_name: string | null; email: string }) => p.display_name?.trim() || p.email.split("@")[0];
const reportsUrl = () => `${siteUrl()}/history?tab=reports`;

interface ReportRow<D> {
  id: string;
  ai: unknown;
  emailed_at: string | null;
  data: D;
}

/**
 * A saved report still without its comment and not yet sent: a passing failure, or a run that was cut off
 * mid-try. The next run tries again or, once the tries are used up, sends it without the comment.
 */
export const waitingForAi = (r: ReportRow<AiStatus>) => !r.ai && !r.emailed_at && r.data?.aiFailure === "error" && !r.data.aiFinal;

/**
 * One cron run's try at the AI comment. Saves the comment, or the reason it failed.
 * Returns the data to report with, or null when the report should wait for the next run.
 */
export async function tryComment<D extends AiStatus, A>(
  admin: SupabaseClient,
  rowId: string,
  data: D,
  comment: () => Promise<{ ok: true; value: A } | { ok: false; reason: NonNullable<AiStatus["aiFailure"]> }>,
): Promise<{ data: D; ai: A | null } | null> {
  const save = (d: D, extra: Record<string, unknown> = {}) => admin.from("reports").update({ data: d, ...extra }).eq("id", rowId);
  const giveUp = async (d: D) => {
    const final = { ...d, aiFinal: true };
    await save(final);
    return { data: final, ai: null };
  };

  const done = data.aiTries ?? 0;
  if (done >= AI_RUNS) return giveUp(data); // the last try was cut off: send without the comment now

  // Count the try before making it: if this run is cut off mid-call, the next run picks the report up again.
  const tries = done + 1;
  await save({ ...data, aiFailure: "error", aiTries: tries });
  const res = await comment();
  if (res.ok) {
    const { aiFailure: _f, aiTries: _t, aiFinal: _x, ...clean } = data; // eslint-disable-line @typescript-eslint/no-unused-vars
    await save(clean as D, { ai: res.value });
    return { data: clean as D, ai: res.value };
  }
  const next = { ...data, aiFailure: res.reason, aiTries: tries };
  if (res.reason === "error" && tries < AI_RUNS) {
    await save(next);
    return null;
  }
  return giveUp(next);
}

/** Everything a daily report shows for one day. */
export async function buildDailyData(admin: SupabaseClient, profile: Profile, day: string, now: Date): Promise<DailyData> {
  const d = await loadDay(admin, profile, day, now);

  return {
    date: day,
    eaten: d.eaten,
    target: d.target?.target ?? null,
    diff: d.target ? d.eaten - d.target.target : null,
    meals: d.meals.map((m) => ({
      time: localTime(new Date(m.eaten_at), profile.timezone),
      description: m.description,
      kcal: m.total_kcal,
      items: [...(m.meal_items ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((i) => ({ name: i.name, amount: i.amount != null ? Number(i.amount) : null, unit: i.unit, kcal: i.kcal })),
    })),
    waterMl: d.waterMl,
    waterTargetMl: d.waterTargetMl,
    method: profile.method,
    focus: profile.food_focus,
  };
}

/** Everything a weekly report shows, for the week before `weighInDate`. */
export async function buildWeeklyData(
  admin: SupabaseClient,
  profile: Profile,
  weighInDate: string,
  weights: { date: unknown; kg: unknown }[],
): Promise<WeeklyData> {
  const { start, end } = weekFor(weighInDate);
  const [intake, targets, water, checkins, health, meals] = await Promise.all([
    admin.from("daily_intake").select("date, kcal").eq("user_id", profile.id).gte("date", start).lte("date", end),
    admin.from("daily_targets").select("date, final_target").eq("user_id", profile.id).gte("date", start).lte("date", end),
    admin.from("water_logs").select("date, ml").eq("user_id", profile.id).gte("date", start).lte("date", end),
    admin.from("checkins").select("date, sleep_hours").eq("user_id", profile.id).gte("date", start).lte("date", end),
    admin.from("health_daily").select("date, sleep_minutes").eq("user_id", profile.id).gte("date", start).lte("date", end),
    admin.from("meals").select("eaten_date, description, total_kcal").eq("user_id", profile.id).gte("eaten_date", start).lte("eaten_date", end).order("eaten_at"),
  ]);
  const ws = (weights ?? []).map((w) => ({ date: w.date as string, kg: Number(w.kg) }));
  const latestKg = ws.length ? ws[ws.length - 1].kg : null;

  return summarizeWeek({
    weighInDate,
    method: profile.method,
    focus: profile.food_focus,
    intake: (intake.data ?? []).map((r) => ({ date: r.date as string, kcal: Number(r.kcal) })),
    targets: (targets.data ?? []).map((r) => ({ date: r.date as string, target: Number(r.final_target) })),
    water: (water.data ?? []).map((r) => ({ date: r.date as string, ml: Number(r.ml) })),
    checkinSleep: (checkins.data ?? []).map((r) => ({ date: r.date as string, hours: r.sleep_hours == null ? null : Number(r.sleep_hours) })),
    watchSleep: (health.data ?? []).map((r) => ({ date: r.date as string, minutes: r.sleep_minutes == null ? null : Number(r.sleep_minutes) })),
    weights: ws,
    waterTargetMl: latestKg ? waterTargetMl(latestKg, profile.water_override_ml, 0) : null,
    meals: (meals.data ?? []).map((m) => ({ date: m.eaten_date as string, description: m.description as string, kcal: Number(m.total_kcal) })),
  });
}

/**
 * Yesterday's report, once the person's day has started (wake-up time).
 * Skipped when nothing was logged yesterday. Safe to call every 5 minutes:
 * the unique (user, kind, period) row makes sure it is built and emailed once.
 */
export async function runDailyReport(admin: SupabaseClient, profile: Profile, now: Date): Promise<string> {
  const today = localDate(now, profile.timezone);
  if (minutesOf(localTime(now, profile.timezone)) < minutesOf(hhmm(profile.wake_time))) return "before_wake";
  const day = addDays(today, -1);

  const { data: existing } = await admin
    .from("reports")
    .select("id, ai, emailed_at, data")
    .eq("user_id", profile.id)
    .eq("kind", "daily")
    .eq("period_end", day)
    .maybeSingle();
  if (existing) {
    const row = existing as ReportRow<DailyData>;
    return waitingForAi(row) ? finishDaily(admin, profile, row.id, row.data) : "done";
  }

  // Cheap check first, so days without entries don't load the whole day every 5 minutes.
  const [{ count: mealCount }, { data: waterRows }] = await Promise.all([
    admin.from("meals").select("id", { count: "exact", head: true }).eq("user_id", profile.id).eq("eaten_date", day),
    admin.from("water_logs").select("ml").eq("user_id", profile.id).eq("date", day),
  ]);
  if (!dayWasLogged(mealCount ?? 0, (waterRows ?? []).reduce((s, r) => s + Number(r.ml), 0))) return "nothing_logged";

  const data = await buildDailyData(admin, profile, day, now);

  const { data: row, error } = await admin
    .from("reports")
    .insert({ user_id: profile.id, kind: "daily", period_start: day, period_end: day, data })
    .select("id")
    .single();
  if (error || !row) return "done"; // another run claimed it
  return finishDaily(admin, profile, row.id as string, data);
}

/** AI comment, then the email. If the AI fails for a passing reason, the email waits for the next run. */
async function finishDaily(admin: SupabaseClient, profile: Profile, rowId: string, data: DailyData): Promise<string> {
  const done = await tryComment(admin, rowId, data, () => dailyComment(admin, profile.id, profile.language, data));
  if (!done) return "waiting_for_ai";

  if (wants(profile, "daily")) {
    const mail = renderDaily(profile.language, done.data, done.ai, reportsUrl());
    if (await sendEmail({ to: profile.email, ...mail })) await admin.from("reports").update({ emailed_at: new Date().toISOString() }).eq("id", rowId);
  }
  return done.ai ? "sent" : `sent_without_ai_${done.data.aiFailure}`;
}

/**
 * The weekly report on the person's weigh-in day: as soon as the weight is logged,
 * or at 21:00 without it. Also emails the simplified version to approved followers.
 */
export async function runWeeklyReport(admin: SupabaseClient, profile: Profile, now: Date): Promise<string> {
  const today = localDate(now, profile.timezone);
  if (isoWeekday(today) !== profile.weigh_in_dow) return "not_weigh_in_day";

  const { start, end } = weekFor(today);
  const { data: existing } = await admin
    .from("reports")
    .select("id, ai, emailed_at, data")
    .eq("user_id", profile.id)
    .eq("kind", "weekly")
    .eq("period_end", end)
    .maybeSingle();
  if (existing) {
    const row = existing as ReportRow<WeeklyData>;
    return waitingForAi(row) ? finishWeekly(admin, profile, row.id, row.data) : "done";
  }

  const { data: weights } = await admin.from("weights").select("date, kg").eq("user_id", profile.id).lte("date", today).order("date");
  const weighed = (weights ?? []).some((w) => w.date === today);
  if (!weighed && minutesOf(localTime(now, profile.timezone)) < minutesOf(WEEKLY_FALLBACK)) return "waiting_for_weight";

  const data = await buildWeeklyData(admin, profile, today, weights ?? []);

  const { data: row, error } = await admin
    .from("reports")
    .insert({ user_id: profile.id, kind: "weekly", period_start: start, period_end: end, data })
    .select("id")
    .single();
  if (error || !row) return "done";
  const result = await finishWeekly(admin, profile, row.id as string, data);
  return result === "sent" || result.startsWith("sent_") ? (weighed ? result : `${result}_no_weight`) : result;
}

/** AI comment, the email, then followers. If the AI fails for a passing reason, everything waits for the next run. */
async function finishWeekly(admin: SupabaseClient, profile: Profile, rowId: string, data: WeeklyData): Promise<string> {
  const name = displayName(profile);
  const done = await tryComment(admin, rowId, data, () => weeklyComment(admin, profile.id, profile.language, name, profile.sex, data));
  if (!done) return "waiting_for_ai";
  const ai = done.ai;

  if (wants(profile, "weekly")) {
    const mail = renderWeekly(profile.language, done.data, ai, reportsUrl());
    if (await sendEmail({ to: profile.email, ...mail })) await admin.from("reports").update({ emailed_at: new Date().toISOString() }).eq("id", rowId);
  }

  // People who follow this person, with their approval.
  const { data: follows } = await admin.from("follows").select("follower_id").eq("followee_id", profile.id).eq("status", "approved");
  if (follows?.length) {
    const { data: followers } = await admin.from("profiles").select("email, language, email_prefs").in("id", follows.map((f) => f.follower_id as string));
    for (const f of followers ?? []) {
      if (!wants(f as Pick<Profile, "email_prefs">, "friend")) continue;
      const lang = f.language === "en" ? "en" : "pl";
      // The friend summary is written in the followed person's language; drop it if the follower reads another one.
      const summary = ai && lang === profile.language ? ai.friend_summary : null;
      await sendEmail({ to: f.email as string, ...renderFriend(lang, name, done.data, summary, siteUrl()) });
    }
  }
  return ai ? "sent" : `sent_without_ai_${done.data.aiFailure}`;
}

/** Both report jobs for one person; never throws. */
export async function runReports(admin: SupabaseClient, profile: Profile, now: Date): Promise<string[]> {
  // Side by side, so a slow AI answer for one doesn't push the other past the cron's time limit.
  return Promise.all(
    [runDailyReport, runWeeklyReport].map((job) =>
      job(admin, profile, now).catch((e) => {
        console.error("report failed", job.name, profile.id, e);
        return "error";
      }),
    ),
  );
}

/**
 * The test button: today's daily report (yesterday's if today is still empty) and a
 * weekly report for the last 7 days, emailed now with "TEST" in the subject.
 * Nothing is saved to History.
 */
export async function sendTestReports(
  admin: SupabaseClient,
  profile: Profile,
  now: Date,
): Promise<{ ok: true; to: string } | { ok: false; error: string; sender?: string }> {
  const { emailConfigured, sendEmailDetailed } = await import("../email");
  if (!emailConfigured()) return { ok: false, error: "not_configured" };
  const today = localDate(now, profile.timezone);

  let daily = await buildDailyData(admin, profile, today, now);
  if (!dayWasLogged(daily.meals.length, daily.waterMl)) {
    const yesterday = await buildDailyData(admin, profile, addDays(today, -1), now);
    if (dayWasLogged(yesterday.meals.length, yesterday.waterMl)) daily = yesterday;
  }
  const { data: weights } = await admin.from("weights").select("date, kg").eq("user_id", profile.id).lte("date", today).order("date");
  const weekly = await buildWeeklyData(admin, profile, today, weights ?? []);

  const [dailyAi, weeklyAi] = await Promise.all([
    dailyComment(admin, profile.id, profile.language, daily),
    weeklyComment(admin, profile.id, profile.language, displayName(profile), profile.sex, weekly),
  ]);

  const mails = [
    renderDaily(profile.language, dailyAi.ok ? daily : { ...daily, aiFailure: dailyAi.reason }, dailyAi.ok ? dailyAi.value : null, reportsUrl()),
    renderWeekly(profile.language, weeklyAi.ok ? weekly : { ...weekly, aiFailure: weeklyAi.reason }, weeklyAi.ok ? weeklyAi.value : null, reportsUrl()),
  ];
  for (const mail of mails) {
    const r = await sendEmailDetailed({ to: profile.email, ...mail, subject: `TEST · ${mail.subject}` });
    // The sender address isn't secret; showing it helps spot a typo in GMAIL_USER.
    if (!r.ok) return { ...r, sender: process.env.GMAIL_USER || process.env.EMAIL_FROM };
  }
  return { ok: true, to: profile.email };
}
