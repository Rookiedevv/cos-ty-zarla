import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { FoodFocus, Method } from "../engine/types";
import type { Product } from "./off";

export interface EstimateItem {
  name: string;
  amount: number;
  unit: "g" | "ml" | "pcs";
  kcal: number;
  protein_g: number;
  confidence: "high" | "medium" | "low";
  from_barcode: boolean;
}

export interface EstimateQuestion {
  id: string;
  text: string;
  options: string[];
}

export interface Estimate {
  description: string;
  items: EstimateItem[];
  questions: EstimateQuestion[];
  fits_diet: "yes" | "partly" | "no";
  verdict: string;
}

/** A saved recipe the meal came from: the AI judges how much of it was eaten. */
export interface RecipeRef {
  name: string;
  portions: number;
  total_kcal: number;
  total_protein_g: number | null;
  cooked_weight_g: number | null;
  ingredients: string[];
}

export interface EstimateInput {
  recipe?: RecipeRef;
  photo?: { data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" };
  text?: string;
  products: Product[];
  answers: { question: string; answer: string }[];
  /** 1-based round of questions. On the last round the model must not ask more. */
  round: number;
  language: "en" | "pl";
  method: Method;
  focus: FoodFocus;
}

export const MAX_ROUNDS = 3;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["description", "items", "questions", "fits_diet", "verdict"],
  properties: {
    description: { type: "string", description: "Short plain description of the whole meal, e.g. 'Scrambled eggs (3) with rye bread'." },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "amount", "unit", "kcal", "protein_g", "confidence", "from_barcode"],
        properties: {
          name: { type: "string" },
          amount: { type: "number" },
          unit: { type: "string", enum: ["g", "ml", "pcs"] },
          kcal: { type: "integer" },
          protein_g: { type: "number" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          from_barcode: { type: "boolean" },
        },
      },
    },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "text", "options"],
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          options: { type: "array", items: { type: "string" } },
        },
      },
    },
    fits_diet: { type: "string", enum: ["yes", "partly", "no"] },
    verdict: { type: "string" },
  },
} as const;

const METHOD_LABEL: Record<Method, string> = {
  none: "no special eating method",
  if: "intermittent fasting",
  five_two: "5:2 diet",
  montignac: "Montignac (low glycemic index; avoid sugar, white flour, white rice, potatoes)",
};
const FOCUS_LABEL: Record<FoodFocus, string> = {
  balanced: "balanced (no restrictions; favour protein and vegetables)",
  low_carb: "low-carb / keto (avoid bread, pasta, rice, potatoes, sugar, beer, sweet drinks)",
  mediterranean: "Mediterranean (fish, olive oil, vegetables, legumes; avoid processed meat, fast food, sweets)",
  high_protein: "high-protein (each meal should carry substantial protein)",
  vegetarian: "vegetarian (no meat or fish)",
};

function systemPrompt(input: EstimateInput): string {
  const lang = input.language === "pl" ? "Polish" : "English";
  const lastRound = input.round >= MAX_ROUNDS;
  return [
    "You estimate the calories of a meal for a weight-loss tracking app used in Poland.",
    "Return every item that was eaten with a realistic portion, kcal and protein. Use typical Polish portion sizes and recipes when unsure (e.g. pierogi ~35 g each, a slice of rye bread ~35 g).",
    "Read visible packaging, labels and portion cues in photos. Count pieces you can see.",
    "When packaged product data from a barcode is given, use its per-100 g values for that item, set from_barcode true, and only estimate how much was eaten.",
    "When the person's answers are given, use them and do not ask the same thing again.",
    lastRound
      ? "Do not ask any questions. Give your best estimate with what you have."
      : "Ask up to 3 short questions only when the answer would change the total by more than about 15% (portion eaten, cooking fat, sauce, sugar in drinks, whether the whole package was eaten). Give each 2–4 short answer options. If the estimate is already good, return no questions.",
    ...(input.recipe
      ? [
          "This meal is (at least partly) a saved home recipe described below. Use the recipe's per-portion calories and cooked weight as the reference: judge from the photo and/or the text how much of the dish was eaten (e.g. half a portion, one portion, 1.5 portions).",
          "Return the recipe part as ONE item named after the recipe, with amount = grams eaten (unit g) when the cooked weight is known, otherwise amount = portions eaten (unit pcs), and kcal and protein in proportion to the recipe's values. Add separate items only for food that isn't part of the recipe (a side salad, bread, a drink).",
          "If nothing tells you the amount, assume one portion. Only ask about the amount if the photo and text truly leave it open.",
        ]
      : []),
    "If the input clearly isn't food, return no items and set description to explain that briefly.",
    `The person follows: ${METHOD_LABEL[input.method]}; food focus: ${FOCUS_LABEL[input.focus]}.`,
    "verdict: one sentence on how this meal fits that diet. If it clearly breaks the diet, be firm and direct, name the specific item and why (e.g. 'This doesn't fit keto: the dough alone is about 80 g of carbs.'). Never insult or shame. If it fits, say so briefly.",
    `Write description, item names, questions, options and verdict in ${lang}.`,
  ].join("\n");
}

function userContent(input: EstimateInput): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = [];
  if (input.photo) blocks.push({ type: "image", source: { type: "base64", media_type: input.photo.mediaType, data: input.photo.data } });
  const lines: string[] = [];
  const r = input.recipe;
  if (r) {
    const perKcal = Math.round(r.total_kcal / r.portions);
    const perGrams = r.cooked_weight_g ? Math.round(r.cooked_weight_g / r.portions) : null;
    const perProtein = r.total_protein_g != null ? Math.round((r.total_protein_g / r.portions) * 10) / 10 : null;
    lines.push(
      `Saved recipe "${r.name}": the whole dish is ${r.total_kcal} kcal${r.cooked_weight_g ? ` and about ${r.cooked_weight_g} g cooked` : ""}, split into ${r.portions} portions.` +
        ` One portion = ${perKcal} kcal${perGrams ? `, about ${perGrams} g` : ""}${perProtein != null ? `, ${perProtein} g protein` : ""}.` +
        (r.ingredients.length ? ` Ingredients: ${r.ingredients.slice(0, 25).join(", ")}.` : ""),
    );
  }
  if (input.text?.trim()) lines.push(`The person describes the meal: "${input.text.trim().slice(0, 1500)}"`);
  else if (input.photo) lines.push(r ? "Judge from the photo how much of the recipe is on the plate." : "Estimate the meal in the photo.");
  for (const p of input.products) {
    lines.push(
      `Barcode product: ${p.name}${p.brand ? ` (${p.brand})` : ""}; ${p.kcalPer100 ?? "?"} kcal and ${p.proteinPer100 ?? "?"} g protein per 100 g` +
        `${p.servingSize ? `; serving ${p.servingSize}` : ""}${p.packageSize ? `; package ${p.packageSize}` : ""}.`,
    );
  }
  if (input.answers.length) {
    lines.push("Answers to your earlier questions:");
    for (const a of input.answers) lines.push(`- ${a.question} → ${a.answer}`);
  }
  blocks.push({ type: "text", text: lines.join("\n") });
  return blocks;
}

export interface EstimateCall {
  estimate: Estimate;
  model: string;
  tokensIn: number;
  tokensOut: number;
}

export async function estimateMeal(input: EstimateInput): Promise<EstimateCall> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("NO_API_KEY");
  const model = process.env.AI_MODEL || "claude-haiku-5-5";
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
    max_tokens: 1500,
    system: systemPrompt(input),
    messages: [{ role: "user", content: userContent(input) }],
    output_config: { format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> } },
  });

  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") throw new Error(`INCOMPLETE_${response.stop_reason}`);
  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) throw new Error("NO_OUTPUT");
  const estimate = sanitize(JSON.parse(text) as Estimate, input.round >= MAX_ROUNDS);
  return { estimate, model, tokensIn: response.usage.input_tokens, tokensOut: response.usage.output_tokens };
}

/** Clamp anything out of range; the API guarantees shape, not sensible numbers. */
export function sanitize(e: Estimate, lastRound: boolean): Estimate {
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
  return {
    description: String(e.description ?? "").slice(0, 300),
    items: (e.items ?? []).slice(0, 20).map((i) => ({
      name: String(i.name ?? "").slice(0, 120) || "?",
      amount: Math.round(clamp(i.amount, 0, 5000)),
      unit: i.unit === "ml" || i.unit === "pcs" ? i.unit : "g",
      kcal: Math.round(clamp(i.kcal, 0, 5000)),
      protein_g: Math.round(clamp(i.protein_g, 0, 300) * 10) / 10,
      confidence: i.confidence === "high" || i.confidence === "low" ? i.confidence : "medium",
      from_barcode: Boolean(i.from_barcode),
    })),
    questions: lastRound
      ? []
      : (e.questions ?? []).slice(0, 3).map((q, n) => ({
          id: String(q.id || `q${n + 1}`).slice(0, 20),
          text: String(q.text ?? "").slice(0, 200),
          options: (q.options ?? []).slice(0, 4).map((o) => String(o).slice(0, 60)),
        })),
    fits_diet: e.fits_diet === "no" || e.fits_diet === "partly" ? e.fits_diet : "yes",
    verdict: String(e.verdict ?? "").slice(0, 300),
  };
}
