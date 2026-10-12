import { describe, expect, it } from "vitest";
import { addDays, ageOn, dayBounds, localDate, zonedTimeToUtc } from "./dates";
import { bmr, carryOverFor, computeTarget, floorKcal, waterTargetMl } from "./target";
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
    const t = computeTarget({ today, profile: robert, day: { sleepHours: null, plannedActivity: null } });
    expect(t.provisional).toBe(true);
    expect(t.activitySource).toBe("assumed_rest");
    expect(t.activityKcal).toBe(0);
  });

  it("auto pace = recommended: limited to 25% of burn for a sedentary 100 kg man", () => {
    const t = computeTarget({ today, profile: robert, day: { sleepHours: 8, plannedActivity: "rest" } });
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
    const t = computeTarget({ today, profile: p, day: { sleepHours: 8, plannedActivity: "hard", actualActiveKcal: 1000 } });
    expect(t.deficit).toBe(825); // 75 * 1% * 7700 / 7
    expect(t.recommendedPace).toBeCloseTo(0.01, 4);
  });

  it("auto pace caps the deficit at 1000 kcal", () => {
    const p: BodyProfile = { sex: "male", ageYears: 30, heightCm: 195, weightKg: 150, lifestyle: "physical", pace: "auto" };
    const t = computeTarget({ today, profile: p, day: { sleepHours: 8, plannedActivity: "hard" } });
    expect(t.deficit).toBe(1000);
  });

  it("lets the user choose a harder pace, with warnings", () => {
    const t = computeTarget({ today, profile: { ...robert, pace: 0.0125 }, day: { sleepHours: 8, plannedActivity: "rest" } });
    // 100 kg * 1.25% * 7700 / 7 = 1375 kcal deficit -> 971, below the floor -> 1500
    expect(t.target).toBe(1500);
    expect(t.warnings).toEqual(["above_1_percent", "above_25_percent_of_burn", "above_1000_kcal", "at_floor"]);
    expect(t.expectedKgPerWeek).toBeCloseTo(0.77, 2);
  });

  it("lets the user choose an easier pace without warnings", () => {
    const t = computeTarget({ today, profile: { ...robert, pace: 0.005 }, day: { sleepHours: 8, plannedActivity: "rest" } });
    expect(t.deficit).toBe(550);
    expect(t.warnings).toEqual([]);
    expect(t.expectedKgPerWeek).toBeCloseTo(0.5, 2);
  });

  it("adds planned activity scaled by weight", () => {
    const rest = computeTarget({ today, profile: robert, day: { sleepHours: 8, plannedActivity: "rest" } });
    const hard = computeTarget({ today, profile: robert, day: { sleepHours: 8, plannedActivity: "hard" } });
    expect(hard.activityKcal).toBe(800);
    expect(hard.target).toBeGreaterThan(rest.target);
  });

  it("prefers actual watch activity over the plan", () => {
    const t = computeTarget({ today, profile: robert, day: { sleepHours: 8, plannedActivity: "hard", actualActiveKcal: 120 } });
    expect(t.activitySource).toBe("watch");
    expect(t.activityKcal).toBe(120);
  });

  it("shrinks the deficit by 10% after short sleep", () => {
    const ok = computeTarget({ today, profile: robert, day: { sleepHours: 7, plannedActivity: "rest" } });
    const short = computeTarget({ today, profile: robert, day: { sleepHours: 5, plannedActivity: "rest" } });
    expect(short.sleepAdjusted).toBe(true);
    expect(Math.abs(short.deficit - ok.deficit * 0.9)).toBeLessThanOrEqual(1);
  });

  it("never goes below the floor", () => {
    const small: BodyProfile = { sex: "female", ageYears: 60, heightCm: 155, weightKg: 62, lifestyle: "sedentary", pace: 0.015 };
    const t = computeTarget({ today, profile: small, day: { sleepHours: 8, plannedActivity: "rest" } });
    expect(t.target).toBe(1200);
    expect(t.target).toBeGreaterThanOrEqual(floorKcal(small));
    expect(t.target).toBeGreaterThanOrEqual(1200);
  });

  it("switches to maintenance at BMI 20", () => {
    const lean: BodyProfile = { sex: "male", ageYears: 30, heightCm: 180, weightKg: 64.8, lifestyle: "sedentary", pace: "auto" };
    const t = computeTarget({ today, profile: lean, day: { sleepHours: 8, plannedActivity: "rest" } });
    expect(t.maintenance).toBe(true);
    expect(t.deficit).toBe(0);
    expect(t.target).toBe(t.totalBurn);
    expect(t.expectedKgPerWeek).toBe(0);
  });

  it("uses the fixed low-day target on 5:2 low days", () => {
    const t = computeTarget({ today, profile: robert, day: { sleepHours: 8, plannedActivity: "rest", isLowDay: true } });
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
    const t = computeTarget({ today, profile: robert, day: { sleepHours: 8, plannedActivity: "rest" }, history: h });
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
