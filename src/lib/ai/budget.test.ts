import { describe, expect, it } from "vitest";
import { alertsToSend, costOf, monthStart } from "./budget";
import { sanitize } from "./estimate";

describe("AI budget", () => {
  it("prices Haiku 5.5 per million tokens", () => {
    // 8,000 in + 1,000 out ≈ one meal with a photo and a follow-up
    expect(costOf("claude-haiku-5-5", 8000, 1000)).toBeCloseTo(0.0013, 6);
  });

  it("assumes the higher rate for unknown models", () => {
    expect(costOf("something-new", 1_000_000, 0)).toBe(2);
  });

  it("alerts once at $5 and once at $10", () => {
    expect(alertsToSend(4.99, new Set())).toEqual([]);
    expect(alertsToSend(5.01, new Set())).toEqual(["warn"]);
    expect(alertsToSend(5.5, new Set(["warn"]))).toEqual([]);
    expect(alertsToSend(10.2, new Set(["warn"]))).toEqual(["stop"]);
    expect(alertsToSend(12, new Set())).toEqual(["warn", "stop"]);
  });

  it("starts the month in UTC", () => {
    expect(monthStart(new Date("2026-10-31T23:30:00Z"))).toBe("2026-10-01");
  });
});

describe("sanitize", () => {
  it("clamps silly numbers and limits questions", () => {
    const s = sanitize(
      {
        description: "x",
        items: [{ name: "", amount: -5, unit: "kg" as "g", kcal: 99999, protein_g: NaN, confidence: "sure" as "high", from_barcode: false }],
        questions: [1, 2, 3, 4].map((n) => ({ id: "", text: `q${n}`, options: ["a", "b", "c", "d", "e"] })),
        fits_diet: "maybe" as "yes",
        verdict: "ok",
      },
      false,
    );
    expect(s.items[0]).toMatchObject({ name: "?", amount: 0, unit: "g", kcal: 5000, protein_g: 0, confidence: "medium" });
    expect(s.questions).toHaveLength(3);
    expect(s.questions[0].options).toHaveLength(4);
    expect(s.fits_diet).toBe("yes");
  });

  it("drops questions on the last round", () => {
    const s = sanitize({ description: "", items: [], questions: [{ id: "a", text: "?", options: [] }], fits_diet: "yes", verdict: "" }, true);
    expect(s.questions).toEqual([]);
  });
});

describe("follow-up questions", () => {
  it("never repeats a question id or an option", () => {
    const s = sanitize(
      {
        description: "x",
        items: [],
        questions: [
          { id: "q1", text: "Ile?", options: ["1", "1", "2"] },
          { id: "q1", text: "Olej?", options: ["tak", "nie"] },
          { id: "", text: "Sos?", options: ["tak"] },
        ],
        fits_diet: "yes",
        verdict: "",
      },
      false,
    );
    expect(s.questions.map((q) => q.id)).toEqual(["q1", "q2", "q3"]);
    expect(s.questions[0].options).toEqual(["1", "2"]);
  });

  it("doesn't reuse an id the model already took", () => {
    const s = sanitize(
      { description: "x", items: [], questions: [{ id: "q2", text: "A", options: [] }, { id: "q2", text: "B", options: [] }, { id: "q1", text: "C", options: [] }], fits_diet: "yes", verdict: "" },
      false,
    );
    const ids = s.questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(3);
  });
});

