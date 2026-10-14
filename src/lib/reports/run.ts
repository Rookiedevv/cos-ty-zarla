import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadDay } from "../day";
import { sendEmail } from "../email";
import { addDays, localDate, localTime } from "../engine/dates";
import { waterTargetMl } from "../engine/target";
import { siteUrl } from "../notify/push";
import { hhmm, isoWeekday, minutesOf, type EmailPrefKey, type Profile } from "../profile";
import { dailyComment, weeklyComment } from "./ai";
import { dayWasLogged, summarizeWeek, weekFor, type DailyData, type WeeklyData } from "./build";
import { renderDaily, renderFriend, renderWeekly } from "./email";

/** The weekly report goes out at this local time even without a weigh-in. */
export const WEEKLY_FALLBACK = "21:00";

const wants = (p: { email_prefs: Profile["email_prefs"] }, key: EmailPrefKey) => (p.email_prefs ?? {})[key] !== false;
export const displayName = (p: { display_name: string | null; email: string }) => p.display_name?.trim() || p.email.split("@")[0];
const reportsUrl = () => `${siteUrl()}/history?tab=reports`;

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

  const { data: existing } = await admin.from("reports").select("id").eq("user_id", profile.id).eq("kind", "daily").eq("period_end", day).maybeSingle();
  if (existing) return "done";

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

  const ai = await dailyComment(admin, profile.id, profile.language, data);
  if (ai) await admin.from("reports").update({ ai }).eq("id", row.id);

  if (wants(profile, "daily")) {
    const mail = renderDaily(profile.language, data, ai, reportsUrl());
    if (await sendEmail({ to: profile.email, ...mail })) await admin.from("reports").update({ emailed_at: new Date().toISOString() }).eq("id", row.id);
  }
  return "sent";
}

/**
 * The weekly report on the person's weigh-in day: as soon as the weight is logged,
 * or at 21:00 without it. Also emails the simplified version to approved followers.
 */
export async function runWeeklyReport(admin: SupabaseClient, profile: Profile, now: Date): Promise<string> {
  const today = localDate(now, profile.timezone);
  if (isoWeekday(today) !== profile.weigh_in_dow) return "not_weigh_in_day";

  const { start, end } = weekFor(today);
  const { data: existing } = await admin.from("reports").select("id").eq("user_id", profile.id).eq("kind", "weekly").eq("period_end", end).maybeSingle();
  if (existing) return "done";

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

  const name = displayName(profile);
  const ai = await weeklyComment(admin, profile.id, profile.language, name, profile.sex, data);
  if (ai) await admin.from("reports").update({ ai }).eq("id", row.id);

  if (wants(profile, "weekly")) {
    const mail = renderWeekly(profile.language, data, ai, reportsUrl());
    if (await sendEmail({ to: profile.email, ...mail })) await admin.from("reports").update({ emailed_at: new Date().toISOString() }).eq("id", row.id);
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
      await sendEmail({ to: f.email as string, ...renderFriend(lang, name, data, summary, siteUrl()) });
    }
  }
  return weighed ? "sent" : "sent_without_weight";
}

/** Both report jobs for one person; never throws. */
export async function runReports(admin: SupabaseClient, profile: Profile, now: Date): Promise<string[]> {
  const out: string[] = [];
  for (const job of [runDailyReport, runWeeklyReport]) {
    try {
      out.push(await job(admin, profile, now));
    } catch (e) {
      console.error("report failed", job.name, profile.id, e);
      out.push("error");
    }
  }
  return out;
}

/**
 * The test button: today's daily report (yesterday's if today is still empty) and a
 * weekly report for the last 7 days, emailed now with "TEST" in the subject.
 * Nothing is saved to History.
 */
export async function sendTestReports(admin: SupabaseClient, profile: Profile, now: Date): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
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

  for (const mail of [renderDaily(profile.language, daily, dailyAi, reportsUrl()), renderWeekly(profile.language, weekly, weeklyAi, reportsUrl())]) {
    const r = await sendEmailDetailed({ to: profile.email, ...mail, subject: `TEST · ${mail.subject}` });
    if (!r.ok) return r;
  }
  return { ok: true, to: profile.email };
}
