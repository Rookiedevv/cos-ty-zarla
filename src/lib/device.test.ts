import { describe, expect, it } from "vitest";
import { newDeviceToken, newPairingCode, normalizeCode, sha256 } from "./device";

describe("pairing codes", () => {
  it("look like XXXX-XXXX with no confusable characters", () => {
    for (let i = 0; i < 200; i++) expect(newPairingCode()).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
  });
  it("accept sloppy typing", () => {
    expect(normalizeCode(" k7p4 2qx9 ")).toBe("K7P4-2QX9");
    expect(normalizeCode("K7P4-2QX9")).toBe("K7P4-2QX9");
  });
  it("reject wrong length or confusable characters", () => {
    expect(normalizeCode("K7P4-2QX")).toBeNull();
    expect(normalizeCode("K7P4-2QX0")).toBeNull();
  });
  it("hash consistently and tokens are long and unique", () => {
    expect(sha256("a")).toBe(sha256("a"));
    const a = newDeviceToken(), b = newDeviceToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
  });
});
