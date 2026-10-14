"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { localDate, zonedTimeToUtc } from "@/lib/engine/dates";
import { insideWindow, IF_PRESETS, type MethodConfig } from "@/lib/profile";
import { localTime } from "@/lib/engine/dates";
import { requireUser } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const fail = (error: string): ActionResult => ({ ok: false, error });

// ───────────────────────── Auth ─────────────────────────

export async function signInWithGoogle() {
  const supabase = await createClient();
  const h = await headers();
  const origin = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback`, queryParams: { prompt: "select_account" } },
  });
  if (error || !data.url) redirect("/login?error=1");
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ───────────────────────── Profile / onboarding ─────────────────────────

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const profileSchema = z.object({
  language: z.enum(["en", "pl"]),
  sex: z.enum(["male", "female"]),
  date_of_birth: z.iso.date().refine((d) => d >= "1930-01-01" && d <= "2010-12-31", "dob"),
  height_cm: z.coerce.number().min(120).max(230),
  weight_kg: z.coerce.number().min(30).max(300).optional(),
  lifestyle: z.enum(["sedentary", "on_feet", "physical"]),
  pace: z.union([z.literal("auto"), z.coerce.number().min(0.001).max(0.02)]),
  method: z.enum(["none", "if", "five_two", "montignac"]),
  if_preset: z.string().optional(),
  window_start: time.optional(),
  window_end: time.optional(),
  low_days: z.array(z.coerce.number().int().min(1).max(7)).optional(),
  food_focus: z.enum(["balanced", "low_carb", "mediterranean", "high_protein", "vegetarian"]),
  wake_time: time,
  last_meal_time: time,
  weigh_in_dow: z.coerce.number().int().min(1).max(7),
  weigh_in_time: time,
  water_override_ml: z.union([z.literal(""), z.coerce.number().int().min(500).max(6000)]).optional(),
  timezone: z.string().min(1).max(64),
});

export type ProfileInput = z.input<typeof profileSchema>;

/** Saves onboarding answers or settings. Weight is only written during onboarding. */
export async function saveProfile(input: ProfileInput, mode: "onboarding" | "settings"): Promise<ActionResult> {
  const { supabase, profile } = await requireUser();
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.path.join(".")).join(", "));
  const v = parsed.data;

  let method_config: MethodConfig = {};
  if (v.method === "if") {
    const preset = v.if_preset && IF_PRESETS[v.if_preset] ? v.if_preset : "custom";
    const win = preset === "custom" ? { start: v.window_start, end: v.window_end } : IF_PRESETS[preset];
    if (!win.start || !win.end || win.start === win.end) return fail("window");
    method_config = { preset, start: win.start, end: win.end };
  } else if (v.method === "five_two") {
    const days = [...new Set(v.low_days ?? [])].sort();
    if (days.length !== 2) return fail("low_days");
    method_config = { low_days: days };
  }

  let tz = v.timezone;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
  } catch {
    tz = profile.timezone;
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      language: v.language,
      sex: v.sex,
      date_of_birth: v.date_of_birth,
      height_cm: v.height_cm,
      lifestyle: v.lifestyle,
      pace: v.pace === "auto" ? null : v.pace,
      method: v.method,
      method_config,
      food_focus: v.food_focus,
      wake_time: v.wake_time,
      last_meal_time: v.last_meal_time,
      weigh_in_dow: v.weigh_in_dow,
      weigh_in_time: v.weigh_in_time,
      water_override_ml: v.water_override_ml === "" || v.water_override_ml == null ? null : v.water_override_ml,
      timezone: tz,
      ...(mode === "onboarding" ? { onboarded_at: new Date().toISOString() } : {}),
    })
    .eq("id", profile.id);
  if (error) return fail(error.message);

  if (mode === "onboarding" && v.weight_kg) {
    const today = localDate(new Date(), tz);
    const { error: wErr } = await supabase.from("weights").upsert({ user_id: profile.id, date: today, kg: v.weight_kg });
    if (wErr) return fail(wErr.message);
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

// ───────────────────────── Daily ─────────────────────────

const workoutInput = z.object({
  kind: z.enum(["walk", "run", "gym", "bike", "football", "swim", "other"]),
  minutes: z.coerce.number().int().min(1).max(600),
  effort: z.enum(["easy", "sweaty", "exhausting"]).nullable().optional(),
  description: z.string().trim().max(300).nullable().optional(),
  /** Only for "other": the AI estimate the person saw and accepted. */
  kcal: z.coerce.number().int().min(0).max(5000).nullable().optional(),
});
export type WorkoutInput = z.input<typeof workoutInput>;

const checkinSchema = z.object({
  sleep_hours: z.coerce.number().min(0).max(16).nullable(),
  rest_day: z.boolean().default(false),
  /** Without a watch: today's planned workouts (replaces the previous list). With a watch: omitted. */
  workouts: z.array(workoutInput).max(10).optional(),
});

/** Calories for a workout. Quick picks are computed here from the MET table, never trusted from the client. */
async function workoutRows(userId: string, date: string, weightKg: number, list: z.infer<typeof workoutInput>[]) {
  const { workoutKcal } = await import("@/lib/engine/target");
  return list.map((w) => {
    if (w.kind === "other") {
      return {
        user_id: userId, date, kind: w.kind, minutes: w.minutes, effort: null,
        description: w.description || null,
        kcal: Math.min(w.kcal ?? 0, Math.round(15 * weightKg * (w.minutes / 60))),
        source: "ai" as const,
      };
    }
    const effort = w.effort ?? "sweaty";
    return {
      user_id: userId, date, kind: w.kind, minutes: w.minutes, effort, description: null,
      kcal: workoutKcal(w.kind, effort, w.minutes, weightKg), source: "quick" as const,
    };
  });
}

async function latestWeight(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], userId: string) {
  const { data } = await supabase.from("weights").select("kg").eq("user_id", userId).order("date", { ascending: false }).limit(1).maybeSingle();
  return data ? Number(data.kg) : 80;
}

export async function saveCheckin(input: z.input<typeof checkinSchema>): Promise<ActionResult> {
  const { supabase, profile } = await requireUser();
  const parsed = checkinSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const v = parsed.data;
  const date = localDate(new Date(), profile.timezone);
  const { error } = await supabase.from("checkins").upsert({
    user_id: profile.id,
    date,
    sleep_hours: v.sleep_hours,
    sleep_source: "manual",
    planned_activity: null,
    rest_day: v.rest_day,
  });
  if (error) return fail(error.message);

  if (v.workouts) {
    await supabase.from("workouts").delete().eq("user_id", profile.id).eq("date", date);
    const list = v.rest_day ? [] : v.workouts;
    if (list.length) {
      const rows = await workoutRows(profile.id, date, await latestWeight(supabase, profile.id), list);
      const { error: wErr } = await supabase.from("workouts").insert(rows);
      if (wErr) return fail(wErr.message);
    }
  }
  revalidatePath("/");
  return { ok: true };
}

export async function deleteWorkout(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!z.uuid().safeParse(id).success) return fail("invalid");
  const { error } = await supabase.from("workouts").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/");
  return { ok: true };
}

/** Free-text workout ("1 h of padel, very sweaty") → kcal estimate the person confirms before saving. */
export async function estimateWorkoutAction(input: { text: string; minutes: number | null }): Promise<
  { ok: true; label: string; minutes: number; kcal: number } | { ok: false; error: "ai_paused" | "not_configured" | "invalid" | "failed" }
> {
  const { supabase, profile } = await requireUser();
  const parsed = z.object({ text: z.string().trim().min(2).max(300), minutes: z.number().int().min(1).max(600).nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!process.env.ANTHROPIC_API_KEY || !process.env.SUPABASE_SECRET_KEY) return { ok: false, error: "not_configured" };

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { STOP_USD, costOf, spentThisMonth } = await import("@/lib/ai/budget");
  const { estimateWorkout } = await import("@/lib/ai/workout");
  const { checkCostAlerts } = await import("@/lib/ai/alerts");
  const admin = createAdminClient();
  if ((await spentThisMonth(admin)) >= STOP_USD) return { ok: false, error: "ai_paused" };

  try {
    const call = await estimateWorkout({ ...parsed.data, weightKg: await latestWeight(supabase, profile.id), language: profile.language });
    await admin.from("ai_usage").insert({
      user_id: profile.id, model: call.model, purpose: "workout",
      tokens_in: call.tokensIn, tokens_out: call.tokensOut, cost_usd: costOf(call.model, call.tokensIn, call.tokensOut),
    });
    await checkCostAlerts(admin, await spentThisMonth(admin));
    return { ok: true, ...call.estimate };
  } catch (e) {
    console.error("workout estimate failed", e);
    return { ok: false, error: "failed" };
  }
}

const itemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  amount: z.coerce.number().min(0).max(10000).nullable().optional(),
  unit: z.enum(["g", "ml", "pcs"]).nullable().optional(),
  kcal: z.coerce.number().int().min(0).max(10000),
  protein_g: z.coerce.number().min(0).max(500).nullable().optional(),
  barcode: z.string().max(20).nullable().optional(),
  source: z.enum(["manual", "ai", "barcode"]).default("manual"),
});

const photoSchema = z.object({
  data: z.string().max(3_000_000).regex(/^[A-Za-z0-9+/=]+$/),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

const mealSchema = z.object({
  description: z.string().trim().min(1).max(2000),
  /** Manual entry: one total. AI entry: the confirmed items, and the total is their sum. */
  total_kcal: z.coerce.number().int().min(0).max(10000).optional(),
  protein_g: z.union([z.literal(""), z.coerce.number().min(0).max(500)]).optional(),
  items: z.array(itemSchema).max(30).optional(),
  source: z.enum(["manual", "ai_text", "ai_photo", "barcode"]).default("manual"),
  verdict: z.string().max(400).optional(),
  ai_draft: z.unknown().optional(),
  photo: photoSchema.optional(),
  when: z.enum(["now", "m30", "h1", "h2", "h3", "custom"]),
  custom_date: z.iso.date().optional(),
  custom_time: time.optional(),
});

const WHEN_MINUTES = { now: 0, m30: 30, h1: 60, h2: 120, h3: 180 } as const;

export async function logMeal(input: z.input<typeof mealSchema>): Promise<ActionResult> {
  const { supabase, profile } = await requireUser();
  const parsed = mealSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.path.join(".")).join(", "));
  const v = parsed.data;

  const items = v.items ?? [];
  const totalKcal = items.length ? items.reduce((s, i) => s + i.kcal, 0) : v.total_kcal;
  if (totalKcal == null || totalKcal > 10000) return fail("total_kcal");
  const protein = items.length
    ? Math.round(items.reduce((s, i) => s + (i.protein_g ?? 0), 0) * 10) / 10
    : v.protein_g === "" || v.protein_g == null ? null : v.protein_g;

  const now = new Date();
  let eatenAt: Date;
  if (v.when === "custom") {
    if (!v.custom_date || !v.custom_time) return fail("custom_time");
    eatenAt = zonedTimeToUtc(v.custom_date, v.custom_time, profile.timezone);
    if (eatenAt.getTime() > now.getTime() + 5 * 60000) return fail("future");
  } else {
    eatenAt = new Date(now.getTime() - WHEN_MINUTES[v.when] * 60000);
  }

  const mealId = crypto.randomUUID();
  let photoPath: string | null = null;
  if (v.photo) {
    const ext = v.photo.mediaType.split("/")[1].replace("jpeg", "jpg");
    photoPath = `${profile.id}/${mealId}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("meal-photos")
      .upload(photoPath, Buffer.from(v.photo.data, "base64"), { contentType: v.photo.mediaType, upsert: false });
    if (upErr) {
      console.error("photo upload failed", upErr.message);
      photoPath = null; // the meal still saves without its photo
    }
  }

  const outside = profile.method === "if" && !insideWindow(localTime(eatenAt, profile.timezone), profile.method_config ?? {});
  const { error } = await supabase.from("meals").insert({
    id: mealId,
    user_id: profile.id,
    eaten_at: eatenAt.toISOString(),
    eaten_date: localDate(eatenAt, profile.timezone),
    description: v.description,
    source: v.source,
    total_kcal: totalKcal,
    protein_g: protein,
    verdict: v.verdict || null,
    ai_draft: v.ai_draft ?? null,
    photo_path: photoPath,
    outside_window: outside,
  });
  if (error) return fail(error.message);

  if (items.length) {
    const { error: itemsErr } = await supabase.from("meal_items").insert(
      items.map((i, position) => ({
        meal_id: mealId,
        user_id: profile.id,
        position,
        name: i.name,
        amount: i.amount ?? null,
        unit: i.unit ?? null,
        kcal: i.kcal,
        protein_g: i.protein_g ?? null,
        barcode: i.barcode ?? null,
        source: i.source,
      })),
    );
    if (itemsErr) console.error("meal items failed", itemsErr.message);
  }

  revalidatePath("/");
  revalidatePath("/history");
  return { ok: true };
}

// ───────────────────────── AI estimate ─────────────────────────

const estimateSchema = z.object({
  photo: photoSchema.optional(),
  text: z.string().max(1500).optional(),
  barcodes: z.array(z.string().regex(/^\d{8,14}$/)).max(3).default([]),
  answers: z.array(z.object({ question: z.string().max(300), answer: z.string().max(300) })).max(9).default([]),
  round: z.number().int().min(1).max(3),
});

export type EstimateResponse =
  | { ok: true; estimate: import("@/lib/ai/estimate").Estimate; products: import("@/lib/ai/off").Product[] }
  | { ok: false; error: "ai_paused" | "not_configured" | "invalid" | "failed" };

/** Photo and/or text in, an editable estimate (and maybe follow-up questions) out. */
export async function estimateMealAction(input: z.input<typeof estimateSchema>): Promise<EstimateResponse> {
  const { profile } = await requireUser();
  const parsed = estimateSchema.safeParse(input);
  if (!parsed.success || (!parsed.data.photo && !parsed.data.text?.trim() && !parsed.data.barcodes.length)) {
    return { ok: false, error: "invalid" };
  }
  const v = parsed.data;
  if (!process.env.ANTHROPIC_API_KEY || !process.env.SUPABASE_SECRET_KEY) return { ok: false, error: "not_configured" };

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { STOP_USD, costOf, spentThisMonth } = await import("@/lib/ai/budget");
  const { estimateMeal } = await import("@/lib/ai/estimate");
  const { lookupBarcode } = await import("@/lib/ai/off");
  const { checkCostAlerts } = await import("@/lib/ai/alerts");
  const admin = createAdminClient();

  if ((await spentThisMonth(admin)) >= STOP_USD) return { ok: false, error: "ai_paused" };

  const products = (await Promise.all([...new Set(v.barcodes)].map(lookupBarcode))).filter((p) => p != null);

  try {
    const call = await estimateMeal({
      photo: v.photo,
      text: v.text,
      products,
      answers: v.answers,
      round: v.round,
      language: profile.language,
      method: profile.method,
      focus: profile.food_focus,
    });
    await admin.from("ai_usage").insert({
      user_id: profile.id,
      model: call.model,
      purpose: v.photo ? "meal_photo" : "meal_text",
      tokens_in: call.tokensIn,
      tokens_out: call.tokensOut,
      cost_usd: costOf(call.model, call.tokensIn, call.tokensOut),
    });
    await checkCostAlerts(admin, await spentThisMonth(admin));
    return { ok: true, estimate: call.estimate, products };
  } catch (e) {
    console.error("estimate failed", e);
    return { ok: false, error: (e as Error).message === "NO_API_KEY" ? "not_configured" : "failed" };
  }
}

export async function deleteMeal(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!z.uuid().safeParse(id).success) return fail("invalid");
  const { error } = await supabase.from("meals").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/");
  revalidatePath("/history");
  return { ok: true };
}

export async function addWater(ml: number): Promise<ActionResult> {
  const { supabase, profile } = await requireUser();
  if (!Number.isInteger(ml) || ml === 0 || ml < -2000 || ml > 3000) return fail("invalid");
  const now = new Date();
  const { error } = await supabase
    .from("water_logs")
    .insert({ user_id: profile.id, at: now.toISOString(), date: localDate(now, profile.timezone), ml });
  if (error) return fail(error.message);
  revalidatePath("/");
  return { ok: true };
}

export async function saveWeight(kg: number): Promise<ActionResult> {
  const { supabase, profile } = await requireUser();
  if (!(kg >= 30 && kg <= 300)) return fail("invalid");
  const date = localDate(new Date(), profile.timezone);
  const { error } = await supabase.from("weights").upsert({ user_id: profile.id, date, kg: Math.round(kg * 10) / 10 });
  if (error) return fail(error.message);
  // On the weigh-in day, the weekly report goes out right away (the 5-minute job is the backup).
  if (profile.onboarded_at) {
    after(async () => {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const { runWeeklyReport } = await import("@/lib/reports/run");
      try {
        await runWeeklyReport(createAdminClient(), profile, new Date());
      } catch (e) {
        console.error("weekly report after weigh-in failed", e);
      }
    });
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

// ───────────────────────── Admin: allow-list ─────────────────────────

export async function addAllowedEmail(email: string): Promise<ActionResult> {
  const { supabase, profile } = await requireUser();
  if (!profile.is_admin) return fail("forbidden");
  const parsed = z.email().safeParse(email.trim().toLowerCase());
  if (!parsed.success) return fail("email");
  const { error } = await supabase.from("allowed_emails").upsert({ email: parsed.data });
  if (error) return fail(error.message);
  revalidatePath("/settings");
  return { ok: true };
}

export async function removeAllowedEmail(email: string): Promise<ActionResult> {
  const { supabase, profile } = await requireUser();
  if (!profile.is_admin) return fail("forbidden");
  if (email === profile.email) return fail("self");
  const { error } = await supabase.from("allowed_emails").delete().eq("email", email);
  if (error) return fail(error.message);
  revalidatePath("/settings");
  return { ok: true };
}

// ───────────────────────── Notifications ─────────────────────────

export async function getPushPublicKey(): Promise<string | null> {
  await requireUser();
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { getVapidKeys } = await import("@/lib/notify/push");
    return (await getVapidKeys(createAdminClient())).publicKey;
  } catch (e) {
    console.error("push key unavailable", e);
    return null;
  }
}

const subscriptionSchema = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
});

export async function savePushSubscription(sub: unknown, userAgent: string): Promise<ActionResult> {
  const { supabase, profile } = await requireUser();
  const parsed = subscriptionSchema.safeParse(sub);
  if (!parsed.success) return fail("invalid");
  // A device that was registered to someone else (shared phone) moves to whoever enabled it last.
  const { createAdminClient } = await import("@/lib/supabase/admin");
  await createAdminClient().from("push_subscriptions").delete().eq("endpoint", parsed.data.endpoint).neq("user_id", profile.id);
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: profile.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      user_agent: userAgent.slice(0, 300),
    },
    { onConflict: "endpoint" },
  );
  if (error) return fail(error.message);
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) return fail(error.message);
  return { ok: true };
}

const prefsSchema = z.object({
  checkin: z.boolean(),
  window: z.boolean(),
  remaining: z.boolean(),
  water: z.boolean(),
  weighin: z.boolean(),
});

export async function saveNotificationPrefs(prefs: z.input<typeof prefsSchema>): Promise<ActionResult> {
  const { supabase, profile } = await requireUser();
  const parsed = prefsSchema.safeParse(prefs);
  if (!parsed.success) return fail("invalid");
  const { error } = await supabase.from("profiles").update({ notification_prefs: parsed.data }).eq("id", profile.id);
  if (error) return fail(error.message);
  revalidatePath("/settings");
  return { ok: true };
}

/** Sends a test reminder to every device the user enabled. */
export async function sendTestNotification(): Promise<ActionResult & { devices?: number }> {
  const { supabase, profile } = await requireUser();
  const { data: subs } = await supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", profile.id);
  if (!subs?.length) return fail("no_devices");
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { sendPush } = await import("@/lib/notify/push");
  const { getDict } = await import("@/lib/i18n");
  const admin = createAdminClient();
  const t = getDict(profile.language).notify;
  let ok = 0;
  for (const s of subs) {
    const r = await sendPush(admin, s, { title: t.testTitle, body: t.testBody, url: "/", tag: "test" });
    if (r === "gone") await admin.from("push_subscriptions").delete().eq("id", s.id);
    if (r === "ok") ok++;
  }
  return ok > 0 ? { ok: true, devices: ok } : fail("send_failed");
}

// ───────────────────────── Watch / companion app ─────────────────────────

/** A one-time code to type into the companion app. */
export async function createPairingCode(): Promise<{ ok: true; code: string; expiresAt: string } | { ok: false; error: string }> {
  const { profile } = await requireUser();
  const { newPairingCode, sha256, PAIRING_MINUTES } = await import("@/lib/device");
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  // Old unused codes for this person stop working when a new one is made.
  await admin.from("pairing_codes").delete().eq("user_id", profile.id).is("used_at", null);
  const code = newPairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_MINUTES * 60000).toISOString();
  const { error } = await admin.from("pairing_codes").insert({ code_hash: sha256(code), user_id: profile.id, expires_at: expiresAt });
  if (error) return { ok: false, error: "failed" };
  return { ok: true, code, expiresAt };
}

export async function disconnectDevice(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!z.uuid().safeParse(id).success) return fail("invalid");
  const { error } = await supabase.from("device_tokens").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteWeight(date: string): Promise<ActionResult> {
  const { supabase, profile } = await requireUser();
  if (!z.iso.date().safeParse(date).success) return fail("invalid");
  const { error } = await supabase.from("weights").delete().eq("user_id", profile.id).eq("date", date);
  if (error) return fail(error.message);
  revalidatePath("/", "layout");
  return { ok: true };
}

// ───────────────────────── Reports: emails and following ─────────────────────────

const emailPrefsSchema = z.object({ daily: z.boolean(), weekly: z.boolean(), friend: z.boolean() }).partial();

export async function saveEmailPrefs(prefs: z.input<typeof emailPrefsSchema>): Promise<ActionResult> {
  const { supabase, profile } = await requireUser();
  const parsed = emailPrefsSchema.safeParse(prefs);
  if (!parsed.success) return fail("invalid");
  const { error } = await supabase.from("profiles").update({ email_prefs: { ...(profile.email_prefs ?? {}), ...parsed.data } }).eq("id", profile.id);
  if (error) return fail(error.message);
  revalidatePath("/settings");
  return { ok: true };
}

/** Asks to follow someone's weekly progress; they get a phone notification to approve. */
export async function requestFollow(followeeId: string): Promise<ActionResult> {
  const { supabase, profile } = await requireUser();
  if (!z.uuid().safeParse(followeeId).success || followeeId === profile.id) return fail("invalid");
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("id, language").eq("id", followeeId).not("onboarded_at", "is", null).maybeSingle();
  if (!target) return fail("invalid");
  const { error } = await supabase.from("follows").insert({ follower_id: profile.id, followee_id: followeeId });
  if (error) return fail(error.code === "23505" ? "exists" : error.message);

  const { sendPush } = await import("@/lib/notify/push");
  const { getDict } = await import("@/lib/i18n");
  const { displayName } = await import("@/lib/reports/run");
  const t = getDict(target.language as string).reports;
  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", followeeId);
  for (const sub of subs ?? []) {
    await sendPush(admin, sub, { title: t.followRequestTitle, body: t.followRequestBody(displayName(profile)), url: "/settings?tab=diet#follow", tag: "follow" });
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function approveFollow(followerId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!z.uuid().safeParse(followerId).success) return fail("invalid");
  const { error } = await supabase.rpc("approve_follow", { p_follower: followerId });
  if (error) return fail(error.message);
  revalidatePath("/settings");
  return { ok: true };
}

/** Ends a follow from either side: cancel a request, stop following, decline or remove a follower. */
export async function removeFollow(followerId: string, followeeId: string): Promise<ActionResult> {
  const { supabase, profile } = await requireUser();
  if (followerId !== profile.id && followeeId !== profile.id) return fail("forbidden");
  const { error } = await supabase.from("follows").delete().eq("follower_id", followerId).eq("followee_id", followeeId);
  if (error) return fail(error.message);
  revalidatePath("/settings");
  return { ok: true };
}
