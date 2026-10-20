import { describe, expect, it } from "vitest";
import { withTimeout } from "./long-wait";

describe("withTimeout", () => {
  it("passes a result through", async () => {
    expect(await withTimeout(Promise.resolve({ ok: true }), 1000)).toEqual({ ok: true });
  });
  it("turns a failed server call into the retry path instead of crashing", async () => {
    expect(await withTimeout(Promise.reject(new TypeError("Failed to fetch")), 1000)).toBe("timeout");
  });
  it("gives up on a call that never answers", async () => {
    expect(await withTimeout(new Promise(() => {}), 20)).toBe("timeout");
  });
  it("lets Next.js redirects through", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    await expect(withTimeout(Promise.reject(redirect), 1000)).rejects.toBe(redirect);
  });
});
