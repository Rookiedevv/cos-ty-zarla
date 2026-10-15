import { describe, expect, it } from "vitest";
import { joinDictation } from "./dictation";

describe("joinDictation", () => {
  it("adds dictated words after typed text with one space", () => {
    expect(joinDictation("500 g makaronu  ", " i sos pomidorowy")).toBe("500 g makaronu i sos pomidorowy");
  });
  it("uses the dictation alone when nothing was typed", () => {
    expect(joinDictation("  ", "cebula")).toBe("cebula");
  });
  it("keeps typed text when nothing was heard", () => {
    expect(joinDictation("oliwa", "   ")).toBe("oliwa");
  });
});
