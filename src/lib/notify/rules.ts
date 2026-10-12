import { getDict } from "../i18n";
import { hhmm, minutesOf, type MethodConfig } from "../profile";

/** Reminder groups the user can switch on or off in Settings. */
export type PrefKey = "checkin" | "window" | "remaining" | "water" | "weighin";
export const PREF_KEYS: PrefKey[] = ["checkin", "window", "remaining", "water", "weighin"];

export type Kind =
  | "checkin_1" | "checkin_2" | "checkin_3"
  | "window_open" | "window_closing"
  | "remaining" | "water" | "weighin";

export interface UserNotifyState {
  language: "en" | "pl";
  prefs: Partial<Record<PrefKey, boolean>>;
  method: "none" | "if" | "five_two" | "montignac";
  methodConfig: MethodConfig;
  wakeTime: string;       // HH:MM or HH:MM:SS
  lastMealTime: string;   // used when not fasting
  weighInDow: number;     // ISO weekday
  weighInTime: string;
  /** User's local now. */
  localTime: string;      // HH:MM
  localWeekday: number;   // ISO weekday
  hasCheckin: boolean;
  hasWeightToday: boolean;
  waterMl: number;
  waterTargetMl: number | null;
  /** kcal left today (negative when over), or null when there is no target yet. */
  kcalLeft: number | null;
  /** Kinds already sent today. */
  sent: Set<string>;
}

export interface Due {
  kind: Kind;
  title: string;
  body: string;
  url: string;
}

/** How long after its scheduled minute a reminder may still go out (the job runs every 5 minutes). */
export const SEND_WINDOW_MIN = 15;

const WATER_CHECK = "15:00";
const CHECKIN_REPEATS = ["12:00", "16:00"];

/** Whether `now` falls in [at, at + SEND_WINDOW_MIN) on the same day. */
function isDue(now: string, at: string): boolean {
  const n = minutesOf(now), a = minutesOf(at);
  return n >= a && n < a + SEND_WINDOW_MIN;
}

function shift(at: string, minutes: number): string | null {
  const m = minutesOf(at) + minutes;
  if (m < 0 || m >= 24 * 60) return null;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * Which reminders should go out for this user right now.
 * Reminders only fire when there is something to do, and at most once a day each.
 */
export function dueNotifications(u: UserNotifyState): Due[] {
  const t = getDict(u.language).notify;
  const on = (k: PrefKey) => u.prefs[k] !== false;
  const out: Due[] = [];
  const add = (kind: Kind, at: string | null, cond: boolean, title: string, body: string, url = "/") => {
    if (at && cond && !u.sent.has(kind) && isDue(u.localTime, at)) out.push({ kind, title, body, url });
  };

  // Morning check-in, repeated while still missing.
  if (on("checkin") && !u.hasCheckin) {
    const wake = hhmm(u.wakeTime);
    add("checkin_1", wake, true, t.checkinTitle, t.checkinBody, "/checkin");
    CHECKIN_REPEATS.forEach((at, i) => {
      const kind = (i === 0 ? "checkin_2" : "checkin_3") as Kind;
      add(kind, at, minutesOf(at) > minutesOf(wake), t.checkinTitle, t.checkinAgain, "/checkin");
    });
  }

  // Eating window.
  const fasting = u.method === "if" && u.methodConfig.start && u.methodConfig.end;
  if (fasting && on("window")) {
    const start = hhmm(u.methodConfig.start), end = hhmm(u.methodConfig.end);
    add("window_open", start, true, t.windowOpenTitle, t.windowOpenBody(end));
    add("window_closing", shift(end, -30), true, t.windowClosingTitle, t.windowClosingBody(end));
  }

  // Calories left, 2 h before the last chance to eat.
  if (on("remaining") && u.kcalLeft != null) {
    const lastEat = fasting ? hhmm(u.methodConfig.end) : hhmm(u.lastMealTime);
    const body = u.kcalLeft >= 0 ? t.remainingLeft(Math.round(u.kcalLeft)) : t.remainingOver(Math.round(-u.kcalLeft));
    add("remaining", shift(lastEat, -120), true, t.remainingTitle, body);
  }

  // Water, if behind by mid-afternoon.
  if (on("water") && u.waterTargetMl) {
    add("water", WATER_CHECK, u.waterMl < u.waterTargetMl * 0.5, t.waterTitle, t.waterBody(u.waterMl, u.waterTargetMl));
  }

  // Weekly weigh-in.
  if (on("weighin") && u.localWeekday === u.weighInDow) {
    add("weighin", hhmm(u.weighInTime), !u.hasWeightToday, t.weighinTitle, t.weighinBody, "/settings");
  }

  return out;
}
