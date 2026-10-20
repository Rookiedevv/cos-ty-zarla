import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkCostAlerts } from "../ai/alerts";
import { STOP_USD, costOf, spentThisMonth } from "../ai/budget";
import { getDict } from "../i18n";
import type { AiFailure, DailyData, WeeklyData } from "./build";

export type { AiFailure };

export interface DailyAi {
  good: string[];
  bad: string[];
  tip: string;
}

export interface WeeklyAi {
  summary: string;
  diet_fit: string;
  /** Empty when sleep was fine. */
  sleep: string;
  suggestions: { what: string; how: string }[];
  /** 1–2 sentences about the person, in the third person, for people who follow them. */
  friend_summary: string;
}

const DAILY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["good", "bad", "tip"],
  properties: {
    good: { type: "array", items: { type: "string" }, description: "1–3 specific things done well." },
    bad: { type: "array", items: { type: "string" }, description: "0–3 specific problems. Empty if there were none." },
    tip: { type: "string", description: "One concrete thing to do today." },
  },
} as const;

const WEEKLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "diet_fit", "sleep", "suggestions", "friend_summary"],
  properties: {
    summary: { type: "string", description: "2–3 sentences on overall progress this week." },
    diet_fit: { type: "string", description: "2–3 sentences on how well the meals fit the chosen method and food focus." },
    sleep: { type: "string", description: "1–2 sentences about sleep ONLY if it was too short; otherwise an empty string." },
    suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["what", "how"],
        properties: { what: { type: "string" }, how: { type: "string" } },
      },
      description: "2–3 improvements for next week, each with a concrete how.",
    },
    friend_summary: { type: "string", description: "1–2 sentences in the third person about how the week went, no food details." },
  },
} as const;

function dietLabel(lang: "en" | "pl", method: DailyData["method"], focus: DailyData["focus"]) {
  const t = getDict(lang);
  return `method: ${t.methods[method][0]} (${t.methods[method][1]}); food focus: ${t.focuses[focus][0]} (${t.focuses[focus][1]})`;
}

export type AiResult<T> = { ok: true; value: T } | { ok: false; reason: AiFailure };

/** Tries per call inside one run. Outages that last longer are retried on the next cron runs (see run.ts). */
const ATTEMPTS = 3;
let pauseMs = (attempt: number): number => (attempt === 2 ? 1500 : 4000);
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Tests only: no waiting between tries. */
export function _noPauseForTests() {
  pauseMs = () => 0;
}

/**
 * Runs one AI call with a JSON schema, records its cost, and respects the monthly hard stop.
 * Retries failed or cut-off answers (cut-off ones with twice the room). Never throws.
 */
async function callJson<T>(
  admin: SupabaseClient,
  userId: string,
  purpose: string,
  system: string,
  user: string,
  schema: Record<string, unknown>,
  maxTokens: number,
): Promise<AiResult<T>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, reason: "no_key" };
  const model = process.env.AI_MODEL || "claude-haiku-5-5";
  // The cron run has 60 s for everyone; this loop retries itself, so no hidden SDK retries.
  const client = new Anthropic({ apiKey, timeout: 15_000, maxRetries: 0 });
  const started = Date.now();
  let room = maxTokens;
  let refusals = 0;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    if (attempt > 1) {
      if (Date.now() - started > 20_000) break; // leave the rest to the next cron run
      await pause(pauseMs(attempt));
    }
    try {
      if ((await spentThisMonth(admin)) >= STOP_USD) return { ok: false, reason: "budget" };
      const response = await client.messages.create({
        model,
        max_tokens: room,
        system,
        messages: [{ role: "user", content: user }],
        output_config: { format: { type: "json_schema", schema } },
      });
      await admin.from("ai_usage").insert({
        user_id: userId,
        model,
        purpose,
        tokens_in: response.usage.input_tokens,
        tokens_out: response.usage.output_tokens,
        cost_usd: costOf(model, response.usage.input_tokens, response.usage.output_tokens),
      });
      await checkCostAlerts(admin, await spentThisMonth(admin));
      if (response.stop_reason === "refusal") {
        refusals++;
        console.error(`${purpose} AI refused (attempt ${attempt})`);
        continue;
      }
      if (response.stop_reason === "max_tokens") {
        console.error(`${purpose} AI answer cut off at ${room} tokens (attempt ${attempt})`);
        room *= 2;
        continue;
      }
      const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
      if (!text) continue;
      return { ok: true, value: JSON.parse(text) as T };
    } catch (e) {
      console.error(`${purpose} AI failed (attempt ${attempt})`, e);
    }
  }
  // Refused every time → say so; anything else (including a mix) counts as a service problem.
  return { ok: false, reason: refusals === ATTEMPTS ? "refused" : "error" };
}

const VOICE = (lang: "en" | "pl") =>
  [
    "You are a friendly but honest coach in a calorie and fasting app used by two friends.",
    "Be specific: name the actual foods. Praise what was genuinely good; critique what was genuinely bad, directly but kindly.",
    "Judge against the person's chosen diet method and food focus, and against healthy eating (protein, vegetables, fibre, sugar, alcohol, processed food, portion size, late eating).",
    "Never shame. No medical claims. Short sentences.",
    lang === "pl"
      ? "Write in Polish. Address the person informally (ty). Avoid gendered verb forms: prefer present tense, nouns or forms like 'udało ci się'."
      : "Write in English, addressing the person as 'you'.",
  ].join("\n");

export async function dailyComment(admin: SupabaseClient, userId: string, lang: "en" | "pl", d: DailyData): Promise<AiResult<DailyAi>> {
  const meals = d.meals
    .map((m) => `${m.time} ${m.description} — ${m.kcal} kcal${m.items.length ? ` [${m.items.map((i) => `${i.name}${i.amount != null ? ` ${i.amount}${i.unit ?? ""}` : ""} ${i.kcal} kcal`).join("; ")}]` : ""}`)
    .join("\n");
  const user = [
    `Diet: ${dietLabel(lang, d.method, d.focus)}.`,
    `Yesterday: eaten ${d.eaten} kcal${d.target != null ? `, target ${d.target} kcal (${d.diff! > 0 ? `${d.diff} over` : `${-d.diff!} under`})` : ""}.`,
    `Water: ${d.waterMl} ml${d.waterTargetMl ? ` of ${d.waterTargetMl} ml` : ""}.`,
    `Meals:\n${meals || "(none logged)"}`,
    "Review the structure of these meals.",
  ].join("\n");
  // Polish needs many tokens; 500 was cutting answers off. You only pay for what's written.
  const res = await callJson<DailyAi>(admin, userId, "report_daily", VOICE(lang), user, DAILY_SCHEMA as unknown as Record<string, unknown>, 1500);
  if (!res.ok) return res;
  const r = res.value;
  const clean = (a: unknown) => (Array.isArray(a) ? a.map((s) => String(s).slice(0, 300)).filter(Boolean).slice(0, 3) : []);
  return { ok: true, value: { good: clean(r.good), bad: clean(r.bad), tip: String(r.tip ?? "").slice(0, 300) } };
}

export async function weeklyComment(
  admin: SupabaseClient,
  userId: string,
  lang: "en" | "pl",
  name: string,
  sex: "male" | "female" | null,
  w: WeeklyData,
): Promise<AiResult<WeeklyAi>> {
  const days = w.days
    .map((d) => `${d.date}: ${d.logged ? `${d.eaten} kcal${d.target != null ? ` / target ${d.target}` : ""}` : "nothing logged"}, water ${d.waterMl} ml${d.sleepHours != null ? `, sleep ${d.sleepHours} h` : ""}`)
    .join("\n");
  const meals = w.meals.slice(0, 60).map((m) => `${m.date}: ${m.description} (${m.kcal} kcal)`).join("\n");
  const user = [
    `Person: ${name}${sex ? ` (${sex}; use matching grammatical gender in friend_summary)` : ""}. Diet: ${dietLabel(lang, w.method, w.focus)}.`,
    `Week ${w.start} – ${w.end}. Days logged ${w.daysLogged}/7; on target ${w.daysOnTarget}/${w.daysWithTarget}; week total ${w.weekDiff > 0 ? `${w.weekDiff} kcal over` : `${-w.weekDiff} kcal under`} target.`,
    w.weight.kg != null
      ? `Weight today ${w.weight.kg} kg${w.weight.changeWeek != null ? `, ${w.weight.changeWeek > 0 ? "+" : ""}${w.weight.changeWeek} kg vs last weigh-in` : ""}${w.weight.changeTotal != null ? `, ${w.weight.changeTotal > 0 ? "+" : ""}${w.weight.changeTotal} kg since start` : ""}.`
      : "No weigh-in this week.",
    `Water target ${w.water.targetMl ?? "?"} ml, hit on ${w.water.daysHit}/7 days.`,
    `Sleep: ${w.sleep.nights ? `average ${w.sleep.avgHours} h over ${w.sleep.nights} nights, ${w.sleep.shortNights} nights under ${6} h` : "no data"}.`,
    `Days:\n${days}`,
    `Meals:\n${meals || "(none logged)"}`,
  ].join("\n");
  const res = await callJson<WeeklyAi>(admin, userId, "report_weekly", VOICE(lang), user, WEEKLY_SCHEMA as unknown as Record<string, unknown>, 2500);
  if (!res.ok) return res;
  const r = res.value;
  const s = (v: unknown, n = 600) => String(v ?? "").slice(0, n);
  return { ok: true, value: {
    summary: s(r.summary),
    diet_fit: s(r.diet_fit),
    sleep: s(r.sleep),
    suggestions: (Array.isArray(r.suggestions) ? r.suggestions : []).slice(0, 3).map((x) => ({ what: s(x?.what, 200), how: s(x?.how, 400) })),
    friend_summary: s(r.friend_summary, 400),
  } };
}
