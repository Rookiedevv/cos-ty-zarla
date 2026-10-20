import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { usageRowsSince } from "./budget";
import { AiCallError, RATE_LIMIT, guardedAiCall, parseAnswer } from "./guard";

/**
 * A Supabase stand-in for ai_usage: `rows` cost rows this month (served 1000 per page like the real API),
 * `recent` calls by this person in the last minutes, and every insert recorded.
 */
function fakeAdmin({ rows = 0, cost = 0.001, recent = 0, failRead = false } = {}) {
  const inserts: Record<string, unknown>[] = [];
  const from = () => {
    let head = false;
    let range: [number, number] | null = null;
    const q: Record<string, unknown> = {};
    for (const m of ["eq", "gte", "order", "in"]) q[m] = () => q;
    q.select = (_c: string, opts?: { head?: boolean }) => {
      head = Boolean(opts?.head);
      return q;
    };
    q.range = (a: number, b: number) => {
      range = [a, b];
      return q;
    };
    q.insert = (v: Record<string, unknown>) => {
      inserts.push(v);
      return q;
    };
    q.then = (ok: (v: unknown) => unknown) => {
      if (failRead) return Promise.resolve({ data: null, count: null, error: { message: "down" } }).then(ok);
      if (head) return Promise.resolve({ count: recent, error: null }).then(ok);
      if (range) {
        const n = Math.max(0, Math.min(rows, range[1] + 1) - range[0]);
        return Promise.resolve({ data: Array.from({ length: n }, (_, i) => ({ id: range![0] + i, user_id: "u1", cost_usd: cost })), error: null }).then(ok);
      }
      return Promise.resolve({ data: [], error: null }).then(ok);
    };
    return q;
  };
  return { admin: { from } as unknown as SupabaseClient, inserts };
}

const ok = async () => ({ model: "claude-haiku-5-5", tokensIn: 1000, tokensOut: 200, value: 1 });

describe("AI cost guard", () => {
  it("counts every cost row, not just the first 1000", async () => {
    const rows = await usageRowsSince(fakeAdmin({ rows: 2500 }).admin, "2026-10-01T00:00:00Z");
    expect(rows).toHaveLength(2500);
  });

  it("stops at the monthly limit even with thousands of rows", async () => {
    // 2500 rows × $0.005 = $12.50; the old code saw only 1000 rows = $5.
    const { admin } = fakeAdmin({ rows: 2500, cost: 0.005 });
    expect(await guardedAiCall(admin, "u1", "meal_text", ok)).toEqual({ ok: false, error: "ai_paused" });
  });

  it("limits how many calls one person can make in a few minutes", async () => {
    const { admin } = fakeAdmin({ recent: RATE_LIMIT });
    expect(await guardedAiCall(admin, "u1", "meal_text", ok)).toEqual({ ok: false, error: "busy" });
  });

  it("makes no call when the checks themselves fail", async () => {
    let called = false;
    const { admin } = fakeAdmin({ failRead: true });
    const res = await guardedAiCall(admin, "u1", "recipe", async () => {
      called = true;
      return ok();
    });
    expect(res).toEqual({ ok: false, error: "failed" });
    expect(called).toBe(false);
  });

  it("records the cost of an answer that couldn't be used", async () => {
    const { admin, inserts } = fakeAdmin();
    const res = await guardedAiCall(admin, "u1", "recipe", async () => {
      throw new AiCallError("INCOMPLETE_max_tokens", { model: "claude-haiku-5-5", tokensIn: 900, tokensOut: 2000 });
    });
    expect(res).toEqual({ ok: false, error: "failed" });
    expect(inserts).toEqual([expect.objectContaining({ user_id: "u1", purpose: "recipe", tokens_in: 900, tokens_out: 2000 })]);
  });

  it("records the cost of a good answer once", async () => {
    const { admin, inserts } = fakeAdmin();
    const res = await guardedAiCall(admin, "u1", "workout", ok);
    expect(res.ok).toBe(true);
    expect(inserts).toHaveLength(1);
  });
});

describe("parseAnswer", () => {
  const usage = { input_tokens: 10, output_tokens: 20 };
  it("keeps the cost on cut-off, empty and unreadable answers", () => {
    for (const r of [
      { stop_reason: "max_tokens", usage, content: [{ type: "text", text: '{"a":' }] },
      { stop_reason: "end_turn", usage, content: [] },
      { stop_reason: "end_turn", usage, content: [{ type: "text", text: "not json" }] },
    ]) {
      try {
        parseAnswer(r, "m");
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(AiCallError);
        expect((e as AiCallError).usage).toEqual({ model: "m", tokensIn: 10, tokensOut: 20 });
      }
    }
  });
  it("returns the parsed answer", () => {
    expect(parseAnswer<{ a: number }>({ stop_reason: "end_turn", usage, content: [{ type: "text", text: '{"a":1}' }] }, "m").value).toEqual({ a: 1 });
  });
});
