import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { parseAnswer } from "./guard";

export interface WorkoutEstimate {
  label: string;
  minutes: number;
  kcal: number;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["label", "minutes", "kcal"],
  properties: {
    label: { type: "string", description: "Short name of the activity, e.g. 'Padel'." },
    minutes: { type: "integer" },
    kcal: { type: "integer", description: "Calories burned above resting for the whole session." },
  },
} as const;

/** Estimates a free-text workout ("1 h of padel, very sweaty") for a person of the given weight. */
export async function estimateWorkout(args: { text: string; minutes: number | null; weightKg: number; language: "en" | "pl" }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("NO_API_KEY");
  const model = process.env.AI_MODEL || "claude-haiku-5-5";
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    max_tokens: 200,
    system: [
      "You estimate calories burned in a workout for a weight-loss app.",
      "Use MET values from the Compendium of Physical Activities. Return only calories ABOVE resting: (MET − 1) × weight kg × hours.",
      "Interpret effort words (easy, sweaty, exhausting, 'made me sweat a lot') to pick the MET within the activity's range.",
      "If no duration is given anywhere, assume 45 minutes. Be realistic, never generous.",
      `Write the label in ${args.language === "pl" ? "Polish" : "English"}.`,
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: `Person weighs ${args.weightKg} kg. Workout: "${args.text.slice(0, 300)}"${args.minutes ? `. Duration: ${args.minutes} minutes.` : ""}`,
      },
    ],
    output_config: { format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> } },
  });
  const { value: raw, usage } = parseAnswer<WorkoutEstimate>(response, model);
  const minutes = Math.min(600, Math.max(1, Math.round(args.minutes ?? raw.minutes ?? 45)));
  // Cap at ~15 kcal/kg/hour, beyond any realistic sustained effort.
  const kcal = Math.min(Math.round(15 * args.weightKg * (minutes / 60)), Math.max(0, Math.round(raw.kcal)));
  return {
    estimate: { label: String(raw.label || "").slice(0, 60) || args.text.slice(0, 60), minutes, kcal },
    ...usage,
  };
}
