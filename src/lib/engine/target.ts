import { ENGINE } from "./constants";
import { addDays } from "./dates";
import type { BodyProfile, DayInput, Effort, HistoryDay, TargetBreakdown, WorkoutKind } from "./types";

const round = (n: number) => Math.round(n);

/** Mifflin–St Jeor basal metabolic rate. */
export function bmr(p: Pick<BodyProfile, "sex" | "ageYears" | "heightCm" | "weightKg">): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.ageYears;
  return base + (p.sex === "male" ? 5 : -161);
}

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

/** Hard minimum daily target. The only limit a user can't override. */
export function floorKcal(p: Pick<BodyProfile, "sex">): number {
  return ENGINE.FLOOR_KCAL[p.sex];
}

/** kcal per day needed for a weekly loss of `pace` (fraction of body weight). */
export function deficitForPace(weightKg: number, pace: number): number {
  return (weightKg * pace * ENGINE.KCAL_PER_KG) / 7;
}

/** Weekly pace (fraction of body weight) produced by a daily deficit. */
export function paceForDeficit(weightKg: number, deficit: number): number {
  return (deficit * 7) / (ENGINE.KCAL_PER_KG * weightKg);
}

/** The largest daily deficit within all healthy limits (SPEC §5.2). */
export function healthyDeficit(weightKg: number, totalBurn: number): number {
  return Math.min(
    deficitForPace(weightKg, ENGINE.MAX_WEEKLY_LOSS_FRACTION),
    totalBurn * ENGINE.MAX_DEFICIT_FRACTION_OF_BURN,
    ENGINE.MAX_DEFICIT_KCAL,
  );
}

/**
 * Overage carry-over (SPEC §5.4).
 * Each day that ended over its target spreads that excess over the next
 * CARRY_MAX_DAYS calendar days, taking at most CARRY_MAX_FRACTION_PER_DAY of a
 * day's target in total. Whatever is not recovered in that time is forgiven.
 *
 * `history` holds the days before `today` (any order, gaps allowed).
 * Returns how many kcal to take off today's pre-carry target.
 */
export function carryOverFor(today: string, todayPreCarry: number, history: HistoryDay[]): number {
  const byDate = new Map(history.map((h) => [h.date, h]));
  const start = addDays(today, -(ENGINE.CARRY_MAX_DAYS * 2));
  const queue: { remaining: number; daysLeft: number }[] = [];

  for (let d = start; d < today; d = addDays(d, 1)) {
    const h = byDate.get(d);
    if (h) {
      // What was actually taken off that day is already baked into its final target.
      let applied = Math.max(0, h.preCarryTarget - h.finalTarget);
      for (const q of queue) {
        if (applied <= 0) break;
        const take = Math.min(q.remaining, applied);
        q.remaining -= take;
        applied -= take;
      }
    }
    // A calendar day has passed for every outstanding overage, used or not.
    for (const q of queue) q.daysLeft -= 1;
    if (h) {
      const over = h.eaten - h.finalTarget;
      if (over > 0) queue.push({ remaining: over, daysLeft: ENGINE.CARRY_MAX_DAYS });
    }
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].daysLeft <= 0 || queue[i].remaining <= 0) queue.splice(i, 1);
    }
  }

  const outstanding = queue.reduce((s, q) => s + q.remaining, 0);
  const cap = todayPreCarry * ENGINE.CARRY_MAX_FRACTION_PER_DAY;
  return round(Math.min(outstanding, cap));
}

export interface ComputeTargetArgs {
  today: string;
  profile: BodyProfile;
  day: DayInput;
  history?: HistoryDay[];
}

/** The daily calorie target with a full explanation of how it was reached (SPEC §5). */
export function computeTarget({ today, profile, day, history = [] }: ComputeTargetArgs): TargetBreakdown {
  const b = bmr(profile);
  const bodyMassIndex = bmi(profile.weightKg, profile.heightCm);
  // With fresh watch data, the watch replaces the lifestyle guess and workouts entirely (SPEC §5.1).
  const watchMode = day.watchActiveKcal != null;
  const baseBurn = watchMode ? b * (1 + ENGINE.THERMIC_EFFECT) : b * ENGINE.LIFESTYLE_FACTOR[profile.lifestyle];
  const activityKcal = watchMode ? day.watchActiveKcal! : day.workoutKcal;
  const activitySource: TargetBreakdown["activitySource"] = watchMode ? "watch" : activityKcal > 0 ? "workouts" : "none";

  const totalBurn = (baseBurn + activityKcal) * (profile.burnAdjust ?? 1);
  const floor = floorKcal(profile);
  const provisional = !day.checkedIn;
  const maintenance = bodyMassIndex <= ENGINE.MAINTENANCE_BMI;

  const recDeficit = healthyDeficit(profile.weightKg, totalBurn);
  const recommendedPace = Math.round(paceForDeficit(profile.weightKg, recDeficit) * 10000) / 10000;
  const finish = (preCarryTarget: number, carry: number, extra: Partial<TargetBreakdown>, applyFloor = true): TargetBreakdown => {
    const target = applyFloor ? Math.max(preCarryTarget - carry, floor) : preCarryTarget;
    const deficit = Math.max(0, totalBurn - preCarryTarget);
    const effectivePace = paceForDeficit(profile.weightKg, deficit);
    return {
      bmr: round(b),
      baseBurn: round(baseBurn),
      activityKcal: round(activityKcal),
      mode: watchMode ? "watch" : "lifestyle",
      activitySource,
      totalBurn: round(totalBurn),
      deficit: round(deficit),
      recommendedPace,
      effectivePace: Math.round(effectivePace * 10000) / 10000,
      expectedKgPerWeek: Math.round(effectivePace * profile.weightKg * 100) / 100,
      warnings: [],
      sleepAdjusted: false,
      floor,
      preCarryTarget,
      carryOver: preCarryTarget - target,
      target,
      maintenance,
      provisional,
      bmi: Math.round(bodyMassIndex * 10) / 10,
      ...extra,
    };
  };

  if (maintenance) return finish(round(totalBurn), 0, {});

  // 5:2 low days use a fixed target and skip carry-over.
  if (day.isLowDay) return finish(ENGINE.LOW_DAY_KCAL[profile.sex], 0, {}, false);

  let deficit = profile.pace === "auto" ? recDeficit : deficitForPace(profile.weightKg, profile.pace);

  const sleepAdjusted = deficit > 0 && day.sleepHours != null && day.sleepHours < ENGINE.SHORT_SLEEP_HOURS;
  if (sleepAdjusted) deficit *= 1 - ENGINE.SHORT_SLEEP_DEFICIT_REDUCTION;

  const warnings: TargetBreakdown["warnings"] = [];
  if (paceForDeficit(profile.weightKg, deficit) > ENGINE.MAX_WEEKLY_LOSS_FRACTION + 1e-9) warnings.push("above_1_percent");
  if (deficit > totalBurn * ENGINE.MAX_DEFICIT_FRACTION_OF_BURN + 1e-9) warnings.push("above_25_percent_of_burn");
  if (deficit > ENGINE.MAX_DEFICIT_KCAL + 1e-9) warnings.push("above_1000_kcal");
  if (totalBurn - deficit < floor) warnings.push("at_floor");

  const preCarryTarget = round(Math.max(totalBurn - deficit, floor));
  const carry = carryOverFor(today, preCarryTarget, history);
  return finish(preCarryTarget, carry, { sleepAdjusted, warnings });
}

/** Daily water target in ml (SPEC §8). The user's override replaces the weight-based base. */
export function waterTargetMl(weightKg: number, overrideMl: number | null, exerciseHours: number): number {
  const base = overrideMl ?? weightKg * ENGINE.WATER_ML_PER_KG;
  return Math.round((base + exerciseHours * ENGINE.WATER_ML_PER_EXERCISE_HOUR) / 50) * 50;
}

/** Expected weekly loss in kg for a given average daily deficit. */
export function weeklyLossKg(dailyDeficit: number): number {
  return Math.round(((dailyDeficit * 7) / ENGINE.KCAL_PER_KG) * 100) / 100;
}

/** Calories of a workout above resting: (MET − 1) × kg × hours. */
export function workoutKcal(kind: Exclude<WorkoutKind, "other">, effort: Effort, minutes: number, weightKg: number): number {
  const met = ENGINE.WORKOUT_MET[kind][effort];
  return Math.round((met - 1) * weightKg * (minutes / 60));
}

/** Whether watch data is recent enough to trust for today (SPEC §5.3). */
export function watchIsFresh(updatedAt: string | Date, now: Date): boolean {
  return now.getTime() - new Date(updatedAt).getTime() <= ENGINE.WATCH_STALE_HOURS * 3600 * 1000;
}

/** Active kcal from the watch, or an estimate from steps when only steps arrived (~40 kcal per 1,000 steps at 80 kg). */
export function watchActiveKcal(activeKcal: number | null, steps: number | null, weightKg: number): number | null {
  if (activeKcal != null && activeKcal > 0) return activeKcal;
  if (steps != null && steps > 0) return Math.round(steps * ENGINE.KCAL_PER_STEP_PER_KG * weightKg);
  return activeKcal;
}
