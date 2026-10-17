import { ENGINE } from "../engine/constants";
import { addDays } from "../engine/dates";
import type { FoodFocus, Method } from "../engine/types";

export interface ReportMeal {
  time: string; // HH:MM local
  description: string;
  kcal: number;
  items: { name: string; amount: number | null; unit: string | null; kcal: number }[];
}

/** Why a report has no AI comment. "error" covers outages, timeouts and answers that were cut off or unreadable. */
export type AiFailure = "budget" | "no_key" | "refused" | "error";

/** Cron runs (5 minutes apart) that try the AI comment before the report goes out without it. */
export const AI_RUNS = 3;

/** The reason to show for a missing comment: "pending" while more tries are coming. */
export const aiMissingReason = (d: AiStatus): string | undefined =>
  d.aiFailure === "error" && (d.aiTries ?? 0) < AI_RUNS ? "pending" : d.aiFailure;

/** Kept in a report's data while its AI comment is missing. */
export interface AiStatus {
  /** Why the last try failed. */
  aiFailure?: AiFailure;
  /** Cron runs that tried so far. */
  aiTries?: number;
}

export interface DailyData extends AiStatus {
  date: string;
  eaten: number;
  target: number | null;
  /** eaten − target; positive = over. */
  diff: number | null;
  meals: ReportMeal[];
  waterMl: number;
  waterTargetMl: number | null;
  method: Method;
  focus: FoodFocus;
}

export interface WeekDay {
  date: string;
  eaten: number;
  target: number | null;
  logged: boolean;
  waterMl: number;
  sleepHours: number | null;
}

export interface WeeklyData extends AiStatus {
  start: string;
  end: string;
  weighInDate: string;
  days: WeekDay[];
  daysLogged: number;
  /** Logged days with a target where eaten ≤ target. */
  daysOnTarget: number;
  daysWithTarget: number;
  /** Sum of (eaten − target) over logged days with a target; negative = under for the week. */
  weekDiff: number;
  weight: {
    kg: number | null;
    prevKg: number | null;
    startKg: number | null;
    changeWeek: number | null;
    changeTotal: number | null;
  };
  water: { targetMl: number | null; daysHit: number; avgMl: number };
  sleep: { avgHours: number | null; nights: number; shortNights: number };
  method: Method;
  focus: FoodFocus;
  /** Every meal of the week, for the AI review. Not shown in full. */
  meals: { date: string; description: string; kcal: number }[];
}

export const r1 = (n: number) => Math.round(n * 10) / 10;

/** Whether a day had anything logged, which is when a daily report is worth sending. */
export const dayWasLogged = (mealCount: number, waterMl: number) => mealCount > 0 || waterMl > 0;

/** The 7 days a weekly report covers: the week before the weigh-in day. */
export function weekFor(weighInDate: string): { start: string; end: string } {
  return { start: addDays(weighInDate, -7), end: addDays(weighInDate, -1) };
}

export interface WeekInput {
  weighInDate: string;
  method: Method;
  focus: FoodFocus;
  intake: { date: string; kcal: number }[];
  targets: { date: string; target: number }[];
  water: { date: string; ml: number }[];
  /** Sleep per date from the check-in (hours) or the watch (minutes). Check-in wins. */
  checkinSleep: { date: string; hours: number | null }[];
  watchSleep: { date: string; minutes: number | null }[];
  /** All weigh-ins up to and including the weigh-in day, any order. */
  weights: { date: string; kg: number }[];
  waterTargetMl: number | null;
  meals: { date: string; description: string; kcal: number }[];
}

/** Turns a week of raw rows into the numbers the weekly report shows. Pure. */
export function summarizeWeek(w: WeekInput): WeeklyData {
  const { start, end } = weekFor(w.weighInDate);
  const sum = (rows: { date: string; n: number }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.date, (m.get(r.date) ?? 0) + r.n);
    return m;
  };
  const intake = sum(w.intake.map((r) => ({ date: r.date, n: r.kcal })));
  const water = sum(w.water.map((r) => ({ date: r.date, n: r.ml })));
  const targets = new Map(w.targets.map((t) => [t.date, t.target]));
  const checkin = new Map(w.checkinSleep.filter((s) => s.hours != null).map((s) => [s.date, Number(s.hours)]));
  const watch = new Map(w.watchSleep.filter((s) => s.minutes != null && s.minutes > 0).map((s) => [s.date, Number(s.minutes) / 60]));

  const days: WeekDay[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const eaten = intake.get(d) ?? 0;
    const waterMl = water.get(d) ?? 0;
    days.push({
      date: d,
      eaten,
      target: targets.get(d) ?? null,
      logged: eaten > 0 || waterMl > 0,
      waterMl,
      sleepHours: checkin.get(d) ?? (watch.has(d) ? r1(watch.get(d)!) : null),
    });
  }

  const withTarget = days.filter((d) => d.logged && d.target != null);
  const sleeps = days.map((d) => d.sleepHours).filter((h): h is number => h != null);
  const loggedDays = days.filter((d) => d.logged);

  const weights = [...w.weights].sort((a, b) => a.date.localeCompare(b.date)).filter((x) => x.date <= w.weighInDate);
  const today = weights.find((x) => x.date === w.weighInDate) ?? null;
  const before = weights.filter((x) => x.date < w.weighInDate);
  const prev = before.length ? before[before.length - 1] : null;
  const first = weights[0] ?? null;

  return {
    start,
    end,
    weighInDate: w.weighInDate,
    days,
    daysLogged: loggedDays.length,
    daysOnTarget: withTarget.filter((d) => d.eaten <= d.target!).length,
    daysWithTarget: withTarget.length,
    weekDiff: withTarget.reduce((s, d) => s + d.eaten - d.target!, 0),
    weight: {
      kg: today?.kg ?? null,
      prevKg: prev?.kg ?? null,
      startKg: first?.kg ?? null,
      changeWeek: today && prev ? r1(today.kg - prev.kg) : null,
      changeTotal: today && first && first.date !== today.date ? r1(today.kg - first.kg) : null,
    },
    water: {
      targetMl: w.waterTargetMl,
      daysHit: w.waterTargetMl ? days.filter((d) => d.waterMl >= w.waterTargetMl!).length : 0,
      avgMl: loggedDays.length ? Math.round(loggedDays.reduce((s, d) => s + d.waterMl, 0) / loggedDays.length) : 0,
    },
    sleep: {
      avgHours: sleeps.length ? r1(sleeps.reduce((a, b) => a + b, 0) / sleeps.length) : null,
      nights: sleeps.length,
      shortNights: sleeps.filter((h) => h < ENGINE.SHORT_SLEEP_HOURS).length,
    },
    method: w.method,
    focus: w.focus,
    meals: w.meals.filter((m) => m.date >= start && m.date <= end),
  };
}
