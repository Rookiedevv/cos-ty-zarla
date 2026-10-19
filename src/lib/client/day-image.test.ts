import { describe, expect, it } from "vitest";
import { wrapText } from "./day-image";

// Every character is 10 px wide.
const measure = (s: string) => s.length * 10;

describe("wrapText", () => {
  it("wraps on spaces without going over the width", () => {
    expect(wrapText("Dwie białe bułki z pastą jajeczną", 120, measure)).toEqual(["Dwie białe", "bułki z", "pastą", "jajeczną"]);
  });
  it("cuts a word that is wider than the line", () => {
    expect(wrapText("Konstantynopolitańczykowianeczka", 100, measure)).toEqual(["Konstantyn", "opolitańcz", "ykowianecz", "ka"]);
  });
  it("keeps short text on one line and never returns nothing", () => {
    expect(wrapText("Banan", 200, measure)).toEqual(["Banan"]);
    expect(wrapText("   ", 200, measure)).toEqual([""]);
  });
});
