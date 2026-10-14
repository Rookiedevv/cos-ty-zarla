import { describe, expect, it } from "vitest";
import { dueNotifications, type UserNotifyState } from "./rules";

const base: UserNotifyState = {
  language: "en",
  prefs: {},
  method: "if",
  methodConfig: { start: "12:00", end: "20:00" },
  wakeTime: "07:30:00",
  lastMealTime: "20:00:00",
  weighInDow: 1,
  weighInTime: "07:30:00",
  localTime: "00:00",
  localWeekday: 3,
  hasCheckin: true,
  hasWeightToday: false,
  waterMl: 3000,
  waterTargetMl: 3300,
  kcalLeft: 640,
  sent: new Set(),
};
const kinds = (s: Partial<UserNotifyState>) => dueNotifications({ ...base, ...s }).map((d) => d.kind);

describe("dueNotifications", () => {
  it("sends nothing at a quiet time", () => {
    expect(kinds({ localTime: "10:00" })).toEqual([]);
  });

  it("reminds about a missing check-in at wake time, 12:00 and 16:00", () => {
    expect(kinds({ hasCheckin: false, localTime: "07:30" })).toEqual(["checkin_1"]);
    expect(kinds({ hasCheckin: false, localTime: "07:44" })).toEqual(["checkin_1"]);
    expect(kinds({ hasCheckin: false, localTime: "07:45" })).toEqual([]);
    expect(kinds({ hasCheckin: false, localTime: "12:05" })).toContain("checkin_2");
    expect(kinds({ hasCheckin: false, localTime: "16:00" })).toEqual(["checkin_3"]);
  });

  it("doesn't nag about the check-in once done", () => {
    expect(kinds({ hasCheckin: true, localTime: "07:30" })).toEqual([]);
  });

  it("skips repeats that are earlier than wake-up", () => {
    expect(kinds({ hasCheckin: false, wakeTime: "13:00", localTime: "12:00" })).not.toContain("checkin_2");
  });

  it("announces the eating window and its closing", () => {
    expect(kinds({ localTime: "12:00" })).toEqual(["window_open"]);
    expect(kinds({ localTime: "19:30" })).toEqual(["window_closing"]);
  });

  it("does not send window reminders without IF", () => {
    expect(kinds({ method: "none", localTime: "12:00" })).toEqual([]);
  });

  it("tells calories left 2 h before the window ends", () => {
    const d = dueNotifications({ ...base, localTime: "18:00" });
    expect(d.map((x) => x.kind)).toEqual(["remaining"]);
    expect(d[0].body).toContain("640");
  });

  it("uses the last-meal time when not fasting, and handles being over", () => {
    const d = dueNotifications({ ...base, method: "none", lastMealTime: "21:00", kcalLeft: -150, localTime: "19:00" });
    expect(d.map((x) => x.kind)).toEqual(["remaining"]);
    expect(d[0].body).toContain("150 kcal over");
  });

  it("skips calories left when there's no target yet", () => {
    expect(kinds({ kcalLeft: null, localTime: "18:00" })).toEqual([]);
  });

  it("reminds about water only when behind at 15:00", () => {
    expect(kinds({ waterMl: 1000, localTime: "15:00" })).toEqual(["water"]);
    expect(kinds({ waterMl: 2000, localTime: "15:00" })).toEqual([]);
  });

  it("reminds about the weigh-in only on that day and if not done", () => {
    expect(kinds({ localWeekday: 1, localTime: "07:30" })).toEqual(["weighin"]);
    expect(kinds({ localWeekday: 1, localTime: "07:30", hasWeightToday: true })).toEqual([]);
    expect(kinds({ localWeekday: 2, localTime: "07:30" })).toEqual([]);
  });

  it("nudges again in the afternoon if the weight is still missing", () => {
    expect(kinds({ localWeekday: 1, localTime: "17:05" })).toContain("weighin_2");
    expect(kinds({ localWeekday: 1, localTime: "17:05", hasWeightToday: true })).not.toContain("weighin_2");
    expect(kinds({ localWeekday: 2, localTime: "17:05" })).not.toContain("weighin_2");
  });

  it("never sends the same reminder twice a day", () => {
    expect(kinds({ localTime: "12:00", sent: new Set(["window_open"]) })).toEqual([]);
  });

  it("respects switched-off groups", () => {
    expect(kinds({ localTime: "12:00", prefs: { window: false } })).toEqual([]);
    expect(kinds({ hasCheckin: false, localTime: "07:30", prefs: { checkin: false } })).toEqual([]);
  });

  it("writes in the user's language", () => {
    const d = dueNotifications({ ...base, language: "pl", localTime: "12:00" });
    expect(d[0].title).toBe("Okno żywieniowe otwarte");
  });
});
