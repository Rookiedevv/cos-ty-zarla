import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { addDays, ageOn, localDate, localTime } from "./engine/dates";
import { computeTarget, waterTargetMl, watchActiveKcal, watchIsFresh } from "./engine/target";
import { ENGINE } from "./engine/constants";
import type { Effort, HistoryDay, TargetBreakdown, WorkoutKind } from "./engine/types";
import { hhmm, insideWindow, isoWeekday, type Profile } from "./profile";

export interface Meal {
  id: string;
  eaten_at: string;
  eaten_date: string;
  description: string;
  total_kcal: number;
  protein_g: number | null;
  outside_window: boolean;
  verdict?: string | null;
  meal_items?: MealItem[];
}

export interface MealItem {
  name: string;
  amount: number | null;
  unit: "g" | "ml" | "pcs" | null;
  kcal: number;
  position: number;
}

/** Columns for meal lists: the meal plus its items, so a tapped meal can show what was in it. */
export const MEAL_COLUMNS = "id, eaten_at, eaten_date, description, total_kcal, protein_g, outside_window, verdict, meal_items(name, amount, unit, kcal, position)";

export interface Checkin {
  date: string;
  sleep_hours: number | null;
  rest_day: boolean;
}

export interface Workout {
  id: string;
  kind: WorkoutKind;
  minutes: number;
  effort: Effort | null;
  description: string | null;
  kcal: number;
}

export interface DayState {
  date: string;
  nowLocal: string;
  nowIso: string;
  target: TargetBreakdown | null;
  /** Null when the profile has no weight yet. */
  weightKg: number | null;
  lastWeight: { kg: number; date: string } | null;
  checkin: Checkin | null;
  workouts: Workout[];
  /** A companion app is connected for this person (they use the watch instead of workouts). */
  hasWatch: boolean;
  meals: Meal[];
  eaten: number;
  proteinG: number;
  waterMl: number;
  waterTargetMl: number | null;
  proteinTargetG: number | null;
  isLowDay: boolean;
  isWeighInDay: boolean;
  window: { open: boolean; start: string; end: string } | null;
  /** Today's totals from the connected watch, or null when no watch data exists. */
  watch: {
    steps: number | null;
    activeKcal: number | null;
    exerciseMinutes: number | null;
    sleepMinutes: number | null;
    updatedAt: string;
    /** Recent enough to drive today's target (SPEC §5.3). */
    fresh: boolean;
  } | null;
}

export function todayFor(profile: Profile, now = new Date()) {
  return localDate(now, profile.timezone);
}

/**
 * Loads everything the Today screen needs and stores the day's target snapshot.
 * Every query filters by user explicitly, so this is also safe with the server-side admin client.
 */
export async function loadDay(
  supabase: SupabaseClient,
  profile: Profile,
  date: string,
  now = new Date(),
  /** "after": save the target snapshot once the page has been sent (the Today screen); default waits for it (cron, reports). */
  saveTarget: "wait" | "after" = "wait",
): Promise<DayState> {
  const historyStart = addDays(date, -(ENGINE.CARRY_MAX_DAYS * 2));

  const [weightRes, checkinRes, mealsRes, waterRes, targetsRes, intakeRes, healthRes, workoutsRes, devicesRes] = await Promise.all([
    supabase.from("weights").select("kg, date").eq("user_id", profile.id).lte("date", date).order("date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("checkins").select("date, sleep_hours, rest_day").eq("user_id", profile.id).eq("date", date).maybeSingle(),
    supabase.from("meals").select(MEAL_COLUMNS)
      .eq("user_id", profile.id).eq("eaten_date", date).order("eaten_at", { ascending: true }),
    supabase.from("water_logs").select("ml").eq("user_id", profile.id).eq("date", date),
    supabase.from("daily_targets").select("date, pre_carry_target, final_target").eq("user_id", profile.id).gte("date", historyStart).lt("date", date),
    supabase.from("daily_intake").select("date, kcal").eq("user_id", profile.id).gte("date", historyStart).lt("date", date),
    supabase.from("health_daily").select("steps, active_kcal, exercise_minutes, sleep_minutes, updated_at")
      .eq("user_id", profile.id).eq("date", date).maybeSingle(),
    supabase.from("workouts").select("id, kind, minutes, effort, description, kcal")
      .eq("user_id", profile.id).eq("date", date).order("created_at"),
    supabase.from("device_tokens").select("id").eq("user_id", profile.id).limit(1),
  ]);

  const nowLocal = localTime(now, profile.timezone);
  const isToday = date === localDate(now, profile.timezone);
  const h = healthRes.data;
  const watch = h
    ? {
        steps: h.steps as number | null,
        activeKcal: h.active_kcal as number | null,
        exerciseMinutes: h.exercise_minutes as number | null,
        sleepMinutes: h.sleep_minutes as number | null,
        updatedAt: h.updated_at as string,
        // Past days: whatever the watch recorded. Today: only if synced in the last few hours.
        fresh: !isToday || watchIsFresh(h.updated_at as string, now),
      }
    : null;
  const workouts = (workoutsRes.data as Workout[] | null) ?? [];
  const hasWatch = (devicesRes.data ?? []).length > 0;

  const lastWeight = weightRes.data ? { kg: Number(weightRes.data.kg), date: weightRes.data.date as string } : null;
  const checkin = (checkinRes.data as Checkin | null) ?? null;
  const meals = (mealsRes.data as Meal[] | null) ?? [];
  const eaten = meals.reduce((s, m) => s + m.total_kcal, 0);
  const proteinG = meals.reduce((s, m) => s + Number(m.protein_g ?? 0), 0);
  const waterMl = (waterRes.data ?? []).reduce((s, w) => s + (w.ml as number), 0);

  const isLowDay = profile.method === "five_two" && (profile.method_config.low_days ?? []).includes(isoWeekday(date));
  const isWeighInDay = isoWeekday(date) === profile.weigh_in_dow;

  let target: TargetBreakdown | null = null;
  const weightKg = lastWeight?.kg ?? null;
  if (weightKg && profile.sex && profile.date_of_birth && profile.height_cm && profile.lifestyle) {
    const watchKcal = watch?.fresh ? watchActiveKcal(watch.activeKcal, watch.steps, weightKg) : null;
    const intakeByDate = new Map((intakeRes.data ?? []).map((r) => [r.date as string, r.kcal as number]));
    const history: HistoryDay[] = (targetsRes.data ?? []).map((t) => ({
      date: t.date as string,
      preCarryTarget: t.pre_carry_target as number,
      finalTarget: t.final_target as number,
      eaten: intakeByDate.get(t.date as string) ?? 0,
    }));

    target = computeTarget({
      today: date,
      profile: {
        sex: profile.sex,
        ageYears: ageOn(profile.date_of_birth, date),
        heightCm: Number(profile.height_cm),
        weightKg,
        lifestyle: profile.lifestyle,
        burnAdjust: Number(profile.burn_adjust),
        pace: profile.pace == null ? "auto" : Number(profile.pace),
      },
      day: {
        sleepHours: checkin?.sleep_hours != null ? Number(checkin.sleep_hours) : null,
        checkedIn: checkin != null,
        workoutKcal: workouts.reduce((sum, w) => sum + w.kcal, 0),
        watchActiveKcal: watchKcal,
        isLowDay,
      },
      history,
    });

    const snapshot = { user_id: profile.id, date, pre_carry_target: target.preCarryTarget, final_target: target.target, breakdown: target };
    const save = async () => {
      const { error } = await supabase.from("daily_targets").upsert(snapshot);
      if (error) console.error("daily target save failed", error.message);
    };
    if (saveTarget === "after") after(save);
    else await save();
  }

  const exerciseHours = watch?.fresh
    ? (watch.exerciseMinutes ?? 0) / 60
    : workouts.reduce((sum, w) => sum + w.minutes, 0) / 60;
  const cfg = profile.method_config ?? {};

  return {
    date,
    nowLocal,
    nowIso: now.toISOString(),
    target,
    weightKg,
    lastWeight,
    checkin,
    workouts,
    hasWatch,
    meals,
    eaten,
    proteinG: Math.round(proteinG),
    waterMl,
    waterTargetMl: weightKg ? waterTargetMl(weightKg, profile.water_override_ml, exerciseHours) : null,
    proteinTargetG: profile.food_focus === "high_protein" && weightKg ? Math.round(weightKg * ENGINE.PROTEIN_G_PER_KG) : null,
    isLowDay,
    isWeighInDay,
    window:
      profile.method === "if" && cfg.start && cfg.end
        ? { open: insideWindow(nowLocal, cfg), start: hhmm(cfg.start), end: hhmm(cfg.end) }
        : null,
    watch,
  };
}
