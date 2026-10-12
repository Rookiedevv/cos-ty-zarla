import { describe, expect, it } from "vitest";
import { addDays, ageOn, dayBounds, localDate, zonedTimeToUtc } from "./dates";
import { bmr, watchActiveKcal, watchIsFresh, workoutKcal, carryOverFor, computeTarget, floorKcal, waterTargetMl } from "./target";
import type { BodyProfile, HistoryDay } from "./types";

const robert: BodyProfile = { sex: "male", ageYears: 35, heightCm: 180, weightKg: 100, lifestyle: "sedentary", pace: "auto" };
const today = "2026-10-12";

describe("bmr", () => {
  it("matches Mifflin–St Jeor", () => {
    expect(bmr(robert)).toBe(10 * 100 + 6.25 * 180 - 5 * 35 + 5); // 1955
    expect(bmr({ sex: "female", ageYears: 30, heightCm: 165, weightKg: 70 })).toBeCloseTo(1420.25);
  });
});

describe("computeTarget", () => {
  it("is provisional and assumes rest without a check-in", () => {
    const t = computeTarget({ today, profile: robert, day: { sleepHours: null, checkedIn: false, workoutKcal: 0 } });
    expect(t.provisional).toBe(true);
    expect(t.activitySource).toBe("none");
    expect(t.activityKcal).toBe(0);
  });

  it("auto pace = recommended: limited to 25% of burn for a sedentary 100 kg man", () => {
    const t = computeTarget({ today, profile: robert, day: { sleepHours: 8, checkedIn: true, workoutKcal: 0 } });
    // burn = 1955 * 1.2 = 2346; 25% = 586.5 (1%/week would be 1100, cap 1000)
    expect(t.totalBurn).toBe(2346);
    expect(t.target).toBe(Math.round(2346 - 586.5));
    expect(t.warnings).toEqual([]);
    expect(t.expectedKgPerWeek).toBeCloseTo(0.53, 2);
    expect(t.recommendedPace).toBeCloseTo(0.0053, 4);
    expect(t.provisional).toBe(false);
  });

  it("auto pace is limited by 1%/week for active lighter people", () => {
    const p: BodyProfile = { sex: "male", ageYears: 30, heightCm: 180, weightKg: 75, lifestyle: "physical", pace: "auto" };
    const t = computeTarget({ today, profile: p, day: { sleepHours: 8, checkedIn: true, workoutKcal: 1000 } });
    expect(t.deficit).toBe(825); // 75 * 1% * 7700 / 7
    expect(t.recommendedPace).toBeCloseTo(0.01, 4);
  });

  it("auto pace caps the deficit at 1000 kcal", () => {
    const p: BodyProfile = { sex: "male", ageYears: 30, heightCm: 195, weightKg: 150, lifestyle: "physical", pace: "auto" };
    const t = computeTarget({ today, profile: p, day: { sleepHours: 8, checkedIn: true, workoutKcal: 800 } });
    expect(t.deficit).toBe(1000);
  });

  it("lets the user choose a harder pace, with warnings", () => {
    const t = computeTarget({ today, profile: { ...robert, pace: 0.0125 }, day: { sleepHours: 8, checkedIn: true, workoutKcal: 0 } });
    // 100 kg * 1.25% * 7700 / 7 = 1375 kcal deficit -> 971, below the floor -> 1500
    expect(t.target).toBe(1500);
    expect(t.warnings).toEqual(["above_1_percent", "above_25_percent_of_burn", "above_1000_kcal", "at_floor"]);
    expect(t.expectedKgPerWeek).toBeCloseTo(0.77, 2);
  });

  it("lets the user choose an easier pace without warnings", () => {
    const t = computeTarget({ today, profile: { ...robert, pace: 0.005 }, day: { sleepHours: 8, checkedIn: true, workoutKcal: 0 } });
    expect(t.deficit).toBe(550);
    expect(t.warnings).toEqual([]);
    expect(t.expectedKgPerWeek).toBeCloseTo(0.5, 2);
  });

  it("adds planned workouts on top of the lifestyle burn", () => {
    const rest = computeTarget({ today, profile: robert, day: { sleepHours: 8, checkedIn: true, workoutKcal: 0 } });
    const hard = computeTarget({ today, profile: robert, day: { sleepHours: 8, checkedIn: true, workoutKcal: 800 } });
    expect(hard.mode).toBe("lifestyle");
    expect(hard.activitySource).toBe("workouts");
    expect(hard.activityKcal).toBe(800);
    expect(hard.target).toBeGreaterThan(rest.target);
  });

  it("with a watch: resting burn + 10% digestion + everything measured, ignoring lifestyle and workouts", () => {
    const t = computeTarget({ today, profile: robert, day: { sleepHours: 8, checkedIn: true, workoutKcal: 800, watchActiveKcal: 600 } });
    expect(t.mode).toBe("watch");
    expect(t.activitySource).toBe("watch");
    expect(t.baseBurn).toBe(Math.round(1955 * 1.1));
    expect(t.activityKcal).toBe(600);
    expect(t.totalBurn).toBe(Math.round(1955 * 1.1 + 600));
  });

  it("with a watch the target grows during the day but never drops below the floor", () => {
    const morning = computeTarget({ today, profile: robert, day: { sleepHours: 8, checkedIn: true, workoutKcal: 0, watchActiveKcal: 20 } });
    const evening = computeTarget({ today, profile: robert, day: { sleepHours: 8, checkedIn: true, workoutKcal: 0, watchActiveKcal: 900 } });
    expect(evening.target).toBeGreaterThan(morning.target);
    expect(morning.target).toBeGreaterThanOrEqual(1500);
  });

  it("shrinks the deficit by 10% after short sleep", () => {
    const ok = computeTarget({ today, profile: robert, day: { sleepHours: 7, checkedIn: true, workoutKcal: 0 } });
    const short = computeTarget({ today, profile: robert, day: { sleepHours: 5, checkedIn: true, workoutKcal: 0 } });
    expect(short.sleepAdjusted).toBe(true);
    expect(Math.abs(short.deficit - ok.deficit * 0.9)).toBeLessThanOrEqual(1);
  });

  it("never goes below the floor", () => {
    const small: BodyProfile = { sex: "female", ageYears: 60, heightCm: 155, weightKg: 62, lifestyle: "sedentary", pace: 0.015 };
    const t = computeTarget({ today, profile: small, day: { sleepHours: 8, checkedIn: true, workoutKcal: 0 } });
    expect(t.target).toBe(1200);
    expect(t.target).toBeGreaterThanOrEqual(floorKcal(small));
    expect(t.target).toBeGreaterThanOrEqual(1200);
  });

  it("switches to maintenance at BMI 20", () => {
    const lean: BodyProfile = { sex: "male", ageYears: 30, heightCm: 180, weightKg: 64.8, lifestyle: "sedentary", pace: "auto" };
    const t = computeTarget({ today, profile: lean, day: { sleepHours: 8, checkedIn: true, workoutKcal: 0 } });
    expect(t.maintenance).toBe(true);
    expect(t.deficit).toBe(0);
    expect(t.target).toBe(t.totalBurn);
    expect(t.expectedKgPerWeek).toBe(0);
  });

  it("uses the fixed low-day target on 5:2 low days", () => {
    const t = computeTarget({ today, profile: robert, day: { sleepHours: 8, checkedIn: true, workoutKcal: 0, isLowDay: true } });
    expect(t.target).toBe(600);
    expect(t.carryOver).toBe(0);
  });
});

describe("carryOverFor", () => {
  const day = (offset: number, pre: number, final: number, eaten: number): HistoryDay => ({
    date: addDays(today, offset),
    preCarryTarget: pre,
    finalTarget: final,
    eaten,
  });

  it("is zero without overages", () => {
    expect(carryOverFor(today, 2000, [day(-1, 2000, 2000, 1900)])).toBe(0);
  });

  it("spreads 600 over across 3 days at 10% each (spec example)", () => {
    // Day -3 went 600 over. Days -2 and -1 already took 200 each.
    const h = [day(-3, 2000, 2000, 2600), day(-2, 2000, 1800, 1800), day(-1, 2000, 1800, 1800)];
    expect(carryOverFor(today, 2000, h)).toBe(200);
    // The day after, nothing is left.
    const h2 = [...h, day(0, 2000, 1800, 1800)];
    expect(carryOverFor(addDays(today, 1), 2000, h2)).toBe(0);
  });

  it("forgives what doesn't fit in 3 days", () => {
    const h = [day(-3, 2000, 2000, 4000), day(-2, 2000, 1800, 1800), day(-1, 2000, 1800, 1800)];
    expect(carryOverFor(today, 2000, h)).toBe(200);
    expect(carryOverFor(addDays(today, 1), 2000, [...h, day(0, 2000, 1800, 1800)])).toBe(0);
  });

  it("counts skipped days as passed", () => {
    // Overage 4 days ago, no data since: it has expired.
    expect(carryOverFor(today, 2000, [day(-4, 2000, 2000, 2600)])).toBe(0);
    // Overage 2 days ago, no data since: still applies.
    expect(carryOverFor(today, 2000, [day(-2, 2000, 2000, 2600)])).toBe(200);
  });

  it("caps combined overages at 10% of today's target", () => {
    const h = [day(-2, 2000, 2000, 2500), day(-1, 2000, 1800, 2500)];
    expect(carryOverFor(today, 2000, h)).toBe(200);
  });

  it("is applied through computeTarget and respects the floor", () => {
    const h = [day(-1, 1760, 1760, 2400)];
    const t = computeTarget({ today, profile: robert, day: { sleepHours: 8, checkedIn: true, workoutKcal: 0 }, history: h });
    expect(t.carryOver).toBeGreaterThan(0);
    expect(t.target).toBe(t.preCarryTarget - t.carryOver);
  });
});

describe("water", () => {
  it("uses 33 ml/kg plus exercise, rounded to 50 ml", () => {
    expect(waterTargetMl(100, null, 0)).toBe(3300);
    expect(waterTargetMl(100, null, 1)).toBe(3800);
    expect(waterTargetMl(100, 2000, 0)).toBe(2000);
  });
});

describe("dates", () => {
  it("handles Warsaw time zone and DST", () => {
    expect(localDate(new Date("2026-10-12T22:30:00Z"), "Europe/Warsaw")).toBe("2026-10-13");
    expect(zonedTimeToUtc("2026-10-12", "08:00", "Europe/Warsaw").toISOString()).toBe("2026-10-12T06:00:00.000Z");
    expect(zonedTimeToUtc("2026-12-12", "08:00", "Europe/Warsaw").toISOString()).toBe("2026-12-12T07:00:00.000Z");
    const b = dayBounds("2026-10-25", "Europe/Warsaw"); // DST ends: 25-hour day
    expect((b.end.getTime() - b.start.getTime()) / 3600000).toBe(25);
  });

  it("computes age", () => {
    expect(ageOn("1990-10-13", "2026-10-12")).toBe(35);
    expect(ageOn("1990-10-12", "2026-10-12")).toBe(36);
  });
});

describe("workoutKcal", () => {
  it("counts only calories above resting: (MET − 1) × kg × hours", () => {
    expect(workoutKcal("run", "sweaty", 60, 80)).toBe(Math.round(8.8 * 80));
    expect(workoutKcal("walk", "easy", 60, 80)).toBe(160);
    expect(workoutKcal("gym", "exhausting", 45, 100)).toBe(Math.round(5 * 100 * 0.75));
  });
  it("is more for harder effort", () => {
    expect(workoutKcal("bike", "exhausting", 60, 80)).toBeGreaterThan(workoutKcal("bike", "easy", 60, 80));
  });
});

describe("watchIsFresh", () => {
  const now = new Date("2026-10-12T12:00:00Z");
  it("trusts data up to 6 hours old", () => {
    expect(watchIsFresh("2026-10-12T06:30:00Z", now)).toBe(true);
    expect(watchIsFresh("2026-10-12T05:30:00Z", now)).toBe(false);
  });
});

describe("watchActiveKcal", () => {
  it("prefers real active calories, else estimates from steps", () => {
    expect(watchActiveKcal(450, 9000, 80)).toBe(450);
    expect(watchActiveKcal(null, 10000, 80)).toBe(400);
    expect(watchActiveKcal(0, 10000, 100)).toBe(500);
    expect(watchActiveKcal(null, null, 80)).toBeNull();
  });
});
