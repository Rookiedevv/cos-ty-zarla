/** Date helpers that work on plain YYYY-MM-DD strings and IANA time zones. */

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The calendar date (YYYY-MM-DD) of an instant in a given time zone. */
export function localDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Offset of a time zone from UTC at a given instant, in minutes. */
function tzOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/** The UTC instant of a local wall-clock time (YYYY-MM-DD, HH:MM) in a time zone. */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  const offset = tzOffsetMinutes(guess, timeZone);
  const result = new Date(guess.getTime() - offset * 60000);
  // Correct once more around DST transitions.
  const offset2 = tzOffsetMinutes(result, timeZone);
  return offset2 === offset ? result : new Date(guess.getTime() - offset2 * 60000);
}

/** UTC bounds [start, end) of a local calendar day. */
export function dayBounds(date: string, timeZone: string): { start: Date; end: Date } {
  return { start: zonedTimeToUtc(date, "00:00", timeZone), end: zonedTimeToUtc(addDays(date, 1), "00:00", timeZone) };
}

export function ageOn(dob: string, date: string): number {
  const [y, m, d] = dob.split("-").map(Number);
  const [ty, tm, td] = date.split("-").map(Number);
  let age = ty - y;
  if (tm < m || (tm === m && td < d)) age--;
  return age;
}

/** Local HH:MM of an instant in a time zone. */
export function localTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(instant);
}
