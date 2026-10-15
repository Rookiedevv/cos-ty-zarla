import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// A stand-in for the Claude API that records what we send and answers like the real one.
let server: http.Server;
let lastBody: Record<string, unknown> | null = null;
const reply = {
  description: "Pierogi ruskie (8) ze śmietaną",
  items: [
    { name: "Pierogi ruskie", amount: 280, unit: "pcs", kcal: 620, protein_g: 18, confidence: "medium", from_barcode: false },
    { name: "Śmietana 18%", amount: 40, unit: "g", kcal: 75, protein_g: 1, confidence: "low", from_barcode: false },
  ],
  questions: [{ id: "q1", text: "Ile pierogów zjadłeś?", options: ["6", "8", "10"] }],
  fits_diet: "no",
  verdict: "To nie pasuje do keto: ciasto to ok. 80 g węglowodanów.",
};

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
        usage: { input_tokens: 2100, output_tokens: 310 },
      }));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  process.env.ANTHROPIC_API_KEY = "test-key";
});
afterAll(() => server.close());

describe("estimateMeal against a mock Claude API", () => {
  it("sends photo, text, diet and barcode data with a JSON schema, and parses the reply", async () => {
    const { estimateMeal } = await import("./estimate");
    const call = await estimateMeal({
      photo: { data: "aGVsbG8=", mediaType: "image/jpeg" },
      text: "pierogi ze śmietaną",
      products: [{ barcode: "5900000000000", name: "Śmietana 18%", brand: "Piątnica", kcalPer100: 186, proteinPer100: 2.5, servingSize: null, packageSize: "200 g" }],
      answers: [],
      round: 1,
      language: "pl",
      method: "if",
      focus: "low_carb",
    });

    expect(lastBody!.model).toBe("claude-haiku-5-5");
    const fmt = (lastBody!.output_config as { format: { type: string } }).format;
    expect(fmt.type).toBe("json_schema");
    const content = (lastBody!.messages as { content: { type: string; text?: string }[] }[])[0].content;
    expect(content[0].type).toBe("image");
    expect(content[1].text).toContain("pierogi ze śmietaną");
    expect(content[1].text).toContain("186 kcal");
    expect(String(lastBody!.system)).toContain("low-carb / keto");
    expect(String(lastBody!.system)).toContain("in Polish");

    expect(call.tokensIn).toBe(2100);
    expect(call.estimate.items).toHaveLength(2);
    expect(call.estimate.questions[0].options).toEqual(["6", "8", "10"]);
    expect(call.estimate.fits_diet).toBe("no");
  });

  it("forbids more questions on the last round", async () => {
    const { estimateMeal } = await import("./estimate");
    const call = await estimateMeal({ text: "zupa", products: [], answers: [{ question: "Ile?", answer: "talerz" }], round: 3, language: "en", method: "none", focus: "balanced" });
    expect(String(lastBody!.system)).toContain("Do not ask any questions");
    expect(call.estimate.questions).toEqual([]);
  });

  it("gives the AI the saved recipe's portion as the reference", async () => {
    const { estimateMeal } = await import("./estimate");
    await estimateMeal({
      recipe: { name: "Bigos", portions: 6, total_kcal: 3600, total_protein_g: 180, cooked_weight_g: 2400, ingredients: ["Kapusta kiszona", "Kiełbasa"] },
      text: "pół porcji",
      products: [],
      answers: [],
      round: 1,
      language: "pl",
      method: "none",
      focus: "balanced",
    });
    const text = (lastBody!.messages as { content: { type: string; text?: string }[] }[])[0].content[0].text!;
    expect(text).toContain('Saved recipe "Bigos"');
    expect(text).toContain("One portion = 600 kcal, about 400 g, 30 g protein");
    expect(text).toContain("Kapusta kiszona, Kiełbasa");
    expect(text).toContain("pół porcji");
    expect(String(lastBody!.system)).toContain("ONE item named after the recipe");
  });

  it("leaves recipe instructions out for an ordinary meal", async () => {
    const { estimateMeal } = await import("./estimate");
    await estimateMeal({ text: "jajecznica", products: [], answers: [], round: 1, language: "pl", method: "none", focus: "balanced" });
    expect(String(lastBody!.system)).not.toContain("saved home recipe");
  });
});
