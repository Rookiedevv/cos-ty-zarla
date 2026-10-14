import { describe, expect, it } from "vitest";
import { summarizeWeek } from "./build";
import { renderDaily, renderFriend, renderWeekly } from "./email";

const daily = {
  date: "2026-10-13",
  eaten: 2150,
  target: 1900,
  diff: 250,
  meals: [{ time: "08:30", description: "Jajecznica <script>alert(1)</script>", kcal: 690, items: [{ name: "Jajka", amount: 3, unit: "pcs", kcal: 220 }] }],
  waterMl: 1500,
  waterTargetMl: 2500,
  method: "if" as const,
  focus: "balanced" as const,
};

describe("report emails", () => {
  it("daily: subject, over-target status, escaped meal text", () => {
    const m = renderDaily("pl", daily, { good: ["Dużo białka"], bad: ["Mało warzyw"], tip: "Dodaj sałatkę" }, "https://x.app/history?tab=reports");
    expect(m.subject).toBe("Twój dzień: wtorek, 13 października");
    expect(m.html).toContain("250 kcal ponad cel");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("3 szt.");
    expect(m.text).toContain("+ Dużo białka");
  });

  it("daily without AI still renders", () => {
    const m = renderDaily("en", { ...daily, diff: -100, eaten: 1800 }, null, "https://x.app");
    expect(m.html).toContain("100 kcal under target");
    expect(m.html).toContain("No AI comment");
  });

  const week = summarizeWeek({
    weighInDate: "2026-10-19",
    method: "none",
    focus: "balanced",
    intake: [{ date: "2026-10-12", kcal: 1800 }],
    targets: [{ date: "2026-10-12", target: 2000 }],
    water: [],
    checkinSleep: [],
    watchSleep: [],
    weights: [{ date: "2026-10-12", kg: 90 }, { date: "2026-10-19", kg: 89.4 }],
    waterTargetMl: 2500,
    meals: [],
  });

  it("weekly shows weight change and suggestions", () => {
    const m = renderWeekly("pl", week, { summary: "Dobry tydzień.", diet_fit: "OK.", sleep: "", suggestions: [{ what: "Więcej wody", how: "Butelka przy biurku" }], friend_summary: "x" }, "https://x.app");
    expect(m.html).toContain("89,4 kg");
    expect(m.html).toContain("−0,6 kg w tym tygodniu");
    expect(m.html).toContain("Butelka przy biurku");
    expect(m.html).not.toContain(">Sen<"); // sleep section only when there is something to say
  });

  it("friend version has no meals and no exact weight", () => {
    const m = renderFriend("pl", "Kuba", { ...week, meals: [{ date: "2026-10-12", description: "Tajna pizza", kcal: 900 }] }, "Kuba trzymał się planu.", "https://x.app");
    expect(m.subject).toBe("Tydzień: Kuba");
    expect(m.html).toContain("Kuba trzymał się planu.");
    expect(m.html).not.toContain("Tajna pizza");
    expect(m.html).not.toContain("89,4");
    expect(m.html).toContain("−0,6 kg");
  });
});
