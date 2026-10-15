import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export interface RecipeItem {
  name: string;
  amount: number;
  unit: "g" | "ml" | "pcs";
  kcal: number;
  protein_g: number;
  confidence: "high" | "medium" | "low";
}

export interface RecipeEstimate {
  name: string;
  items: RecipeItem[];
  /** What the AI assumed (amounts it guessed, fat absorbed, etc.). */
  assumptions: string;
}

export interface RecipeInput {
  text: string;
  language: "en" | "pl";
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "items", "assumptions"],
  properties: {
    name: { type: "string", description: "Short name of the dish, e.g. 'Spaghetti bolognese'." },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "amount", "unit", "kcal", "protein_g", "confidence"],
        properties: {
          name: { type: "string" },
          amount: { type: "number" },
          unit: { type: "string", enum: ["g", "ml", "pcs"] },
          kcal: { type: "integer" },
          protein_g: { type: "number" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
    assumptions: { type: "string" },
  },
} as const;

function systemPrompt(input: RecipeInput): string {
  const lang = input.language === "pl" ? "Polish" : "English";
  return [
    "You estimate the calories of a whole home-cooked dish from its ingredients and cooking method, for a weight-loss tracking app used in Poland.",
    "The description may come from voice dictation, so expect missing punctuation and misheard words; read it charitably.",
    "Return one item per ingredient with the amount used in the WHOLE recipe (not per portion), its kcal and protein. Use the raw/dry weight the person gives (e.g. 500 g dry pasta, 1 kg raw chicken).",
    "When an amount is missing, assume a typical Polish home-cooking amount and set confidence low. Spoons: 1 tbsp oil ≈ 10 g, 1 tbsp butter ≈ 15 g, 1 tbsp flour ≈ 10 g, 1 tbsp sugar ≈ 15 g.",
    "Account for the cooking process: fat for frying counts in full unless the person says it was drained or discarded; deep-frying absorbs only part of the oil; water and cooking evaporation add no calories; fat skimmed off broth reduces it.",
    "Ignore water, salt, pepper and dried herbs unless large amounts; leave out items with no meaningful calories.",
    "If the text clearly isn't a dish or ingredients, return no items and explain briefly in assumptions.",
    "assumptions: at most two short sentences naming the biggest guesses you made (amounts you assumed, how you treated the frying fat). Empty string if nothing important was guessed.",
    `Write name, item names and assumptions in ${lang}.`,
  ].join("\n");
}

export interface RecipeCall {
  estimate: RecipeEstimate;
  model: string;
  tokensIn: number;
  tokensOut: number;
}

export async function estimateRecipe(input: RecipeInput): Promise<RecipeCall> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("NO_API_KEY");
  const model = process.env.AI_MODEL || "claude-haiku-5-5";
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
    max_tokens: 2000,
    system: systemPrompt(input),
    messages: [{ role: "user", content: `The dish, ingredients and how it was made: "${input.text.trim().slice(0, 3000)}"` }],
    output_config: { format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> } },
  });

  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") throw new Error(`INCOMPLETE_${response.stop_reason}`);
  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) throw new Error("NO_OUTPUT");
  const estimate = sanitizeRecipe(JSON.parse(text) as RecipeEstimate);
  return { estimate, model, tokensIn: response.usage.input_tokens, tokensOut: response.usage.output_tokens };
}

/** Clamp anything out of range; the API guarantees shape, not sensible numbers. A whole pot can be big, so limits are wider than for a meal. */
export function sanitizeRecipe(e: RecipeEstimate): RecipeEstimate {
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
  return {
    name: String(e.name ?? "").slice(0, 200),
    items: (e.items ?? []).slice(0, 40).map((i) => ({
      name: String(i.name ?? "").slice(0, 120) || "?",
      amount: Math.round(clamp(i.amount, 0, 20000)),
      unit: i.unit === "ml" || i.unit === "pcs" ? i.unit : "g",
      kcal: Math.round(clamp(i.kcal, 0, 20000)),
      protein_g: Math.round(clamp(i.protein_g, 0, 2000) * 10) / 10,
      confidence: i.confidence === "high" || i.confidence === "low" ? i.confidence : "medium",
    })),
    assumptions: String(e.assumptions ?? "").slice(0, 400),
  };
}
