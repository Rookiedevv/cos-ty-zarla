"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
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

const checkinSchema = z.object({
  sleep_hours: z.coerce.number().min(0).max(16).nullable(),
  planned_activity: z.enum(["rest", "light", "moderate", "hard"]),
});

export async function saveCheckin(input: z.input<typeof checkinSchema>): Promise<ActionResult> {
  const { supabase, profile } = await requireUser();
  const parsed = checkinSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const date = localDate(new Date(), profile.timezone);
  const { error } = await supabase.from("checkins").upsert({ user_id: profile.id, date, ...parsed.data, sleep_source: "manual" });
  if (error) return fail(error.message);
  revalidatePath("/");
  return { ok: true };
}

const mealSchema = z.object({
  description: z.string().trim().min(1).max(2000),
  total_kcal: z.coerce.number().int().min(0).max(10000),
  protein_g: z.union([z.literal(""), z.coerce.number().min(0).max(500)]).optional(),
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

  const now = new Date();
  let eatenAt: Date;
  if (v.when === "custom") {
    if (!v.custom_date || !v.custom_time) return fail("custom_time");
    eatenAt = zonedTimeToUtc(v.custom_date, v.custom_time, profile.timezone);
    if (eatenAt.getTime() > now.getTime() + 5 * 60000) return fail("future");
  } else {
    eatenAt = new Date(now.getTime() - WHEN_MINUTES[v.when] * 60000);
  }

  const outside = profile.method === "if" && !insideWindow(localTime(eatenAt, profile.timezone), profile.method_config ?? {});
  const { error } = await supabase.from("meals").insert({
    user_id: profile.id,
    eaten_at: eatenAt.toISOString(),
    eaten_date: localDate(eatenAt, profile.timezone),
    description: v.description,
    source: "manual",
    total_kcal: v.total_kcal,
    protein_g: v.protein_g === "" || v.protein_g == null ? null : v.protein_g,
    outside_window: outside,
  });
  if (error) return fail(error.message);
  revalidatePath("/");
  revalidatePath("/history");
  return { ok: true };
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
