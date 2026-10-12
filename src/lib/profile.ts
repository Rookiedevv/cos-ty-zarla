import type { FoodFocus, Lifestyle, Method, Sex } from "./engine/types";
import type { PrefKey } from "./notify/rules";

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  is_admin: boolean;
  sex: Sex | null;
  date_of_birth: string | null;
  height_cm: number | null;
  lifestyle: Lifestyle | null;
  burn_adjust: number;
  pace: number | null;
  method: Method;
  method_config: MethodConfig;
  food_focus: FoodFocus;
  timezone: string;
  language: "en" | "pl";
  wake_time: string;
  last_meal_time: string;
  weigh_in_dow: number;
  weigh_in_time: string;
  water_override_ml: number | null;
  notification_prefs: Partial<Record<PrefKey, boolean>> | null;
  onboarded_at: string | null;
}

export interface MethodConfig {
  /** IF preset label, e.g. "16:8", or "custom". */
  preset?: string;
  /** IF window, local HH:MM. */
  start?: string;
  end?: string;
  /** 5:2 low days, ISO weekdays (1 = Monday). */
  low_days?: number[];
}

export const IF_PRESETS: Record<string, { start: string; end: string }> = {
  "16:8": { start: "12:00", end: "20:00" },
  "18:6": { start: "13:00", end: "19:00" },
  "20:4": { start: "15:00", end: "19:00" },
};

/** "HH:MM:SS" from Postgres → "HH:MM". */
export const hhmm = (t: string | null | undefined) => (t ?? "").slice(0, 5);

/** Minutes since midnight for "HH:MM". */
export const minutesOf = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/** Whether a local time falls inside the IF window (handles windows that cross midnight). */
export function insideWindow(localHHMM: string, cfg: MethodConfig): boolean {
  if (!cfg.start || !cfg.end) return true;
  const t = minutesOf(localHHMM), s = minutesOf(cfg.start), e = minutesOf(cfg.end);
  return s <= e ? t >= s && t < e : t >= s || t < e;
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a YYYY-MM-DD date. */
export function isoWeekday(date: string): number {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}
