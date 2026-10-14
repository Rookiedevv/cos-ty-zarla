import { describe, expect, it } from "vitest";
import { dayWasLogged, summarizeWeek, weekFor } from "./build";

const base = {
  weighInDate: "2026-10-19", // a Monday
  method: "if" as const,
  focus: "balanced" as const,
  intake: [] as { date: string; kcal: number }[],
  targets: [] as { date: string; target: number }[],
  water: [] as { date: string; ml: number }[],
  checkinSleep: [] as { date: string; hours: number | null }[],
  watchSleep: [] as { date: string; minutes: number | null }[],
  weights: [] as { date: string; kg: number }[],
  waterTargetMl: 2500,
  meals: [] as { date: string; description: string; kcal: number }[],
};

describe("weekly report numbers", () => {
  it("covers the 7 days before the weigh-in day", () => {
    expect(weekFor("2026-10-19")).toEqual({ start: "2026-10-12", end: "2026-10-18" });
    expect(summarizeWeek(base).days.map((d) => d.date)).toEqual([
      "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18",
    ]);
  });

  it("counts days on target only among logged days with a target", () => {
    const w = summarizeWeek({
      ...base,
      intake: [
        { date: "2026-10-12", kcal: 1800 },
        { date: "2026-10-13", kcal: 2300 },
        { date: "2026-10-14", kcal: 1500 },
        { date: "2026-10-19", kcal: 999 }, // weigh-in day itself: not part of the week
      ],
      targets: [
        { date: "2026-10-12", target: 2000 },
        { date: "2026-10-13", target: 2000 },
        { date: "2026-10-15", target: 2000 }, // nothing eaten → not logged
      ],
    });
    expect(w.daysLogged).toBe(3);
    expect(w.daysWithTarget).toBe(2);
    expect(w.daysOnTarget).toBe(1);
    expect(w.weekDiff).toBe(100); // −200 + 300
  });

  it("weight change vs the previous weigh-in and since start", () => {
    const w = summarizeWeek({
      ...base,
      weights: [
        { date: "2026-10-19", kg: 88.4 },
        { date: "2026-09-28", kg: 91 },
        { date: "2026-10-12", kg: 89.1 },
      ],
    });
    expect(w.weight).toEqual({ kg: 88.4, prevKg: 89.1, startKg: 91, changeWeek: -0.7, changeTotal: -2.6 });
  });

  it("no weigh-in today means no change numbers", () => {
    const w = summarizeWeek({ ...base, weights: [{ date: "2026-10-12", kg: 89.1 }] });
    expect(w.weight.kg).toBeNull();
    expect(w.weight.changeWeek).toBeNull();
  });

  it("water days and sleep, check-in sleep winning over the watch", () => {
    const w = summarizeWeek({
      ...base,
      water: [
        { date: "2026-10-12", ml: 1500 },
        { date: "2026-10-12", ml: 1200 },
        { date: "2026-10-13", ml: 800 },
      ],
      checkinSleep: [{ date: "2026-10-12", hours: 7.5 }, { date: "2026-10-13", hours: null }],
      watchSleep: [{ date: "2026-10-12", minutes: 300 }, { date: "2026-10-13", minutes: 330 }, { date: "2026-10-14", minutes: 0 }],
    });
    expect(w.water.daysHit).toBe(1);
    expect(w.water.avgMl).toBe(1750);
    expect(w.days[0].sleepHours).toBe(7.5);
    expect(w.days[1].sleepHours).toBe(5.5);
    expect(w.days[2].sleepHours).toBeNull(); // 0 minutes = no data, not a sleepless night
    expect(w.sleep).toEqual({ avgHours: 6.5, nights: 2, shortNights: 1 });
  });

  it("a daily report needs at least one entry", () => {
    expect(dayWasLogged(0, 0)).toBe(false);
    expect(dayWasLogged(1, 0)).toBe(true);
    expect(dayWasLogged(0, 250)).toBe(true);
  });
});
