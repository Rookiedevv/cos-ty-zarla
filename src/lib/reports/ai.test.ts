import http from "node:http";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailyData } from "./build";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// A stand-in for the Claude API that plays back a list of answers, one per request.
type Reply = { status?: number; stop?: string; text?: string };
let script: Reply[] = [];
let bodies: Record<string, unknown>[] = [];
let server: http.Server;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw);
      bodies.push(body);
      const r = script.shift() ?? { text: "{}" };
      res.setHeader("content-type", "application/json");
      if (r.status) {
        res.statusCode = r.status;
        res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "nope" } }));
        return;
      }
      res.end(JSON.stringify({
        id: "msg", type: "message", role: "assistant", model: body.model,
        content: [{ type: "text", text: r.text ?? "" }],
        stop_reason: r.stop ?? "end_turn", stop_sequence: null,
        usage: { input_tokens: 800, output_tokens: 200 },
      }));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  process.env.ANTHROPIC_API_KEY = "test-key";
  (await import("./ai"))._noPauseForTests();
});
afterAll(() => server.close());
beforeEach(() => {
  script = [];
  bodies = [];
});

/** A Supabase stand-in: every query resolves to no rows; updates are recorded. */
function fakeAdmin(spent = 0) {
  const updates: Record<string, unknown>[] = [];
  const query = (table: string): unknown => {
    const result = { data: table === "ai_usage" ? [{ cost_usd: spent }] : [], error: null };
    const q: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok),
    };
    for (const m of ["select", "eq", "gte", "in", "insert", "maybeSingle", "single"]) q[m] = () => q;
    q.update = (v: Record<string, unknown>) => {
      updates.push(v);
      return q;
    };
    return q;
  };
  return { admin: { from: query } as unknown as SupabaseClient, updates };
}

const day: DailyData = {
  date: "2026-10-16", eaten: 1800, target: 1900, diff: -100, waterMl: 0, waterTargetMl: 2000,
  meals: [{ time: "12:30", description: "Bułki z pastą jajeczną", kcal: 390, items: [] }],
  method: "none" as const, focus: "balanced" as const,
};
const good = JSON.stringify({ good: ["Dużo białka"], bad: [], tip: "Dodaj warzywa" });

describe("report AI comment", () => {
  it("retries a cut-off answer with twice the room", async () => {
    const { dailyComment } = await import("./ai");
    script = [{ stop: "max_tokens", text: '{"good":["Du' }, { text: good }];
    const r = await dailyComment(fakeAdmin().admin, "u1", "pl", day);
    expect(r).toEqual({ ok: true, value: { good: ["Dużo białka"], bad: [], tip: "Dodaj warzywa" } });
    expect(bodies.map((b) => b.max_tokens)).toEqual([1500, 3000]);
  });

  it("retries an unreadable answer, then reports a service problem", async () => {
    const { dailyComment } = await import("./ai");
    script = [{ text: "not json" }, { text: "" }, { text: "{" }];
    expect(await dailyComment(fakeAdmin().admin, "u1", "pl", day)).toEqual({ ok: false, reason: "error" });
    expect(bodies).toHaveLength(3);
  });

  it("says 'refused' only when the AI refused every time", async () => {
    const { dailyComment } = await import("./ai");
    script = [{ stop: "refusal" }, { stop: "refusal" }, { stop: "refusal" }];
    expect(await dailyComment(fakeAdmin().admin, "u1", "pl", day)).toEqual({ ok: false, reason: "refused" });
    script = [{ stop: "refusal" }, { text: good }];
    expect((await dailyComment(fakeAdmin().admin, "u1", "pl", day)).ok).toBe(true);
  });

  it("doesn't call the AI over the monthly limit", async () => {
    const { dailyComment } = await import("./ai");
    expect(await dailyComment(fakeAdmin(10).admin, "u1", "pl", day)).toEqual({ ok: false, reason: "budget" });
    expect(bodies).toHaveLength(0);
  });

  it("retries a request the API rejects", async () => {
    const { dailyComment } = await import("./ai");
    script = [{ status: 400 }, { text: good }];
    expect((await dailyComment(fakeAdmin().admin, "u1", "pl", day)).ok).toBe(true);
  });
});

describe("report waits for the AI", () => {
  it("holds the report on a passing failure, then gives up after the last run", async () => {
    const { tryComment, waitingForAi } = await import("./run");
    const { AI_RUNS } = await import("./build");
    const fail = async () => ({ ok: false as const, reason: "error" as const });
    let data: DailyData = { ...day };
    for (let run = 1; run < AI_RUNS; run++) {
      const { admin } = fakeAdmin();
      expect(await tryComment(admin, "r1", data, fail)).toBeNull();
      data = { ...data, aiFailure: "error", aiTries: run };
      expect(waitingForAi({ id: "r1", ai: null, emailed_at: null, data })).toBe(true);
    }
    const last = await tryComment(fakeAdmin().admin, "r1", data, fail);
    expect(last?.ai).toBeNull();
    expect(last?.data.aiFailure).toBe("error");
    expect(waitingForAi({ id: "r1", ai: null, emailed_at: null, data: last!.data })).toBe(false);
  });

  it("sends at once when the reason won't pass, and clears the reason on success", async () => {
    const { tryComment } = await import("./run");
    expect((await tryComment(fakeAdmin().admin, "r1", day, async () => ({ ok: false as const, reason: "budget" as const })))?.data.aiFailure).toBe("budget");
    const { admin, updates } = fakeAdmin();
    const done = await tryComment(admin, "r1", { ...day, aiFailure: "error" as const, aiTries: 1 }, async () => ({ ok: true as const, value: { tip: "x" } }));
    expect(done?.ai).toEqual({ tip: "x" });
    expect(done?.data).not.toHaveProperty("aiFailure");
    // First the try is counted (so a cut-off run is retried), then the comment is saved.
    expect(updates[0]).toMatchObject({ data: { aiFailure: "error", aiTries: 2 } });
    expect(updates[1]).toMatchObject({ ai: { tip: "x" } });
  });
});
