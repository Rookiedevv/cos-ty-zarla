import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// A stand-in for the Claude API that records what we send and answers like the real one.
let server: http.Server;
let lastBody: Record<string, unknown> | null = null;
let reply: unknown;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      lastBody = JSON.parse(raw);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        id: "msg_1", type: "message", role: "assistant", model: lastBody!.model,
        content: [{ type: "text", text: JSON.stringify(reply) }],
        stop_reason: "end_turn", stop_sequence: null,
        usage: { input_tokens: 900, output_tokens: 420 },
      }));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  process.env.ANTHROPIC_API_KEY = "test-key";
});
afterAll(() => server.close());

describe("estimateRecipe against a mock Claude API", () => {
  it("sends the dictated recipe with a JSON schema and parses the reply", async () => {
    reply = {
      name: "Spaghetti bolognese",
      items: [
        { name: "Makaron spaghetti (suchy)", amount: 500, unit: "g", kcal: 1780, protein_g: 62, confidence: "high" },
        { name: "Mięso mielone wołowe", amount: 500, unit: "g", kcal: 1250, protein_g: 95, confidence: "high" },
        { name: "Oliwa", amount: 20, unit: "ml", kcal: 177, protein_g: 0, confidence: "low" },
      ],
      assumptions: "Przyjęłam 2 łyżki oliwy do smażenia.",
    };
    const { estimateRecipe } = await import("./recipe");
    const call = await estimateRecipe({ text: "pół kilo spaghetti pół kilo mielonego smażone na oliwie sos pomidorowy", language: "pl" });

    expect(lastBody!.model).toBe("claude-haiku-5-5");
    expect((lastBody!.output_config as { format: { type: string } }).format.type).toBe("json_schema");
    const msg = (lastBody!.messages as { content: string }[])[0].content;
    expect(msg).toContain("pół kilo spaghetti");
    expect(String(lastBody!.system)).toContain("WHOLE recipe");
    expect(String(lastBody!.system)).toContain("in Polish");

    expect(call.tokensIn).toBe(900);
    expect(call.estimate.items).toHaveLength(3);
    expect(call.estimate.items.reduce((s, i) => s + i.kcal, 0)).toBe(3207);
    expect(call.estimate.assumptions).toContain("oliwy");
  });

  it("clamps silly numbers and unknown units", async () => {
    const { sanitizeRecipe } = await import("./recipe");
    const s = sanitizeRecipe({
      name: "x",
      items: [{ name: "", amount: -5, unit: "kg" as "g", kcal: 99999, protein_g: Number.NaN, confidence: "sure" as "high" }],
      assumptions: "",
    });
    expect(s.items[0]).toEqual({ name: "?", amount: 0, unit: "g", kcal: 20000, protein_g: 0, confidence: "medium" });
  });
});
