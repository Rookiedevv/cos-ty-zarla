import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, ageOn, localDate, localTime } from "./engine/dates";
import { computeTarget, waterTargetMl } from "./engine/target";
import { ENGINE } from "./engine/constants";
import type { HistoryDay, PlannedActivity, TargetBreakdown } from "./engine/types";
import { hhmm, insideWindow, isoWeekday, type Profile } from "./profile";

export interface Meal {
  id: string;
  eaten_at: string;
  eaten_date: string;
  description: string;
  total_kcal: number;
  protein_g: number | null;
  outside_window: boolean;
}

export interface Checkin {
  date: string;
  sleep_hours: number | null;
  planned_activity: PlannedActivity;
}

export interface DayState {
  date: string;
  nowLocal: string;
  target: TargetBreakdown | null;
  /** Null when the profile has no weight yet. */
  weightKg: number | null;
  lastWeight: { kg: number; date: string } | null;
  checkin: Checkin | null;
  meals: Meal[];
  eaten: number;
  proteinG: number;
  waterMl: number;
  waterTargetMl: number | null;
  proteinTargetG: number | null;
  isLowDay: boolean;
  isWeighInDay: boolean;
  window: { open: boolean; start: string; end: string } | null;
}

export function todayFor(profile: Profile, now = new Date()) {
  return localDate(now, profile.timezone);
}

/** Loads everything the Today screen needs and stores the day's target snapshot. */
export async function loadDay(supabase: SupabaseClient, profile: Profile, date: string, now = new Date()): Promise<DayState> {
  const historyStart = addDays(date, -(ENGINE.CARRY_MAX_DAYS * 2));

  const [weightRes, checkinRes, mealsRes, waterRes, targetsRes, intakeRes] = await Promise.all([
    supabase.from("weights").select("kg, date").lte("date", date).order("date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("checkins").select("date, sleep_hours, planned_activity").eq("date", date).maybeSingle(),
    supabase.from("meals").select("id, eaten_at, eaten_date, description, total_kcal, protein_g, outside_window")
      .eq("eaten_date", date).order("eaten_at", { ascending: true }),
    supabase.from("water_logs").select("ml").eq("date", date),
    supabase.from("daily_targets").select("date, pre_carry_target, final_target").gte("date", historyStart).lt("date", date),
    supabase.from("daily_intake").select("date, kcal").gte("date", historyStart).lt("date", date),
  ]);

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
        plannedActivity: checkin?.planned_activity ?? null,
        isLowDay,
      },
      history,
    });

    await supabase.from("daily_targets").upsert({
      user_id: profile.id,
      date,
      pre_carry_target: target.preCarryTarget,
      final_target: target.target,
      breakdown: target,
    });
  }

  const exerciseHours = checkin ? ENGINE.ACTIVITY_EXERCISE_HOURS[checkin.planned_activity] : 0;
  const nowLocal = localTime(now, profile.timezone);
  const cfg = profile.method_config ?? {};

  return {
    date,
    nowLocal,
    target,
    weightKg,
    lastWeight,
    checkin,
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
  };
}
