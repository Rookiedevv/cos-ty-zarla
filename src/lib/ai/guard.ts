import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkCostAlerts } from "./alerts";
import { STOP_USD, costOf, spentThisMonth } from "./budget";

/** What one AI call cost, kept with a failure so it still counts towards the monthly limit. */
export interface AiUsage {
  model: string;
  tokensIn: number;
  tokensOut: number;
}

/** An AI answer that came back but couldn't be used (refused, cut off, unreadable). Carries what it cost. */
export class AiCallError extends Error {
  constructor(
    message: string,
    readonly usage: AiUsage,
  ) {
    super(message);
    this.name = "AiCallError";
  }
}

/** AI calls one person may start within RATE_WINDOW_MIN minutes. Normal use is a handful. */
export const RATE_LIMIT = 30;
export const RATE_WINDOW_MIN = 10;

export type GuardError = "ai_paused" | "busy" | "not_configured" | "failed";

/** AI calls this person made in the last few minutes (failed ones included). */
export async function recentCalls(admin: SupabaseClient, userId: string, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - RATE_WINDOW_MIN * 60_000).toISOString();
  const { count, error } = await admin.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("at", since);
  if (error) throw new Error(`rate check failed: ${error.message}`);
  return count ?? 0;
}

/**
 * Runs one AI call that a person started: checks the monthly stop and the per-person rate limit first,
 * and records the cost afterwards, also when the answer was unusable. Never throws.
 */
export async function guardedAiCall<T extends AiUsage>(
  admin: SupabaseClient,
  userId: string,
  purpose: string,
  run: () => Promise<T>,
): Promise<{ ok: true; call: T } | { ok: false; error: GuardError }> {
  const record = async (u: AiUsage) => {
    await admin.from("ai_usage").insert({
      user_id: userId,
      model: u.model,
      purpose,
      tokens_in: u.tokensIn,
      tokens_out: u.tokensOut,
      cost_usd: costOf(u.model, u.tokensIn, u.tokensOut),
    });
    await checkCostAlerts(admin, await spentThisMonth(admin));
  };

  try {
    // Fail closed: if the checks can't run, no AI call is made.
    if ((await spentThisMonth(admin)) >= STOP_USD) return { ok: false, error: "ai_paused" };
    if ((await recentCalls(admin, userId)) >= RATE_LIMIT) return { ok: false, error: "busy" };
  } catch (e) {
    console.error(`${purpose}: budget check failed`, e);
    return { ok: false, error: "failed" };
  }

  try {
    const call = await run();
    await record(call);
    return { ok: true, call };
  } catch (e) {
    console.error(`${purpose} AI failed`, e);
    if (e instanceof AiCallError) await record(e.usage).catch((err) => console.error("usage record failed", err));
    return { ok: false, error: (e as Error).message === "NO_API_KEY" ? "not_configured" : "failed" };
  }
}

/** Turns a model's text into JSON, or an AiCallError that still knows what the call cost. */
export function parseAnswer<T>(
  response: { stop_reason: string | null; usage: { input_tokens: number; output_tokens: number }; content: { type: string; text?: string }[] },
  model: string,
): { value: T; usage: AiUsage } {
  const usage = { model, tokensIn: response.usage.input_tokens, tokensOut: response.usage.output_tokens };
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") throw new AiCallError(`INCOMPLETE_${response.stop_reason}`, usage);
  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) throw new AiCallError("NO_OUTPUT", usage);
  try {
    return { value: JSON.parse(text) as T, usage };
  } catch {
    throw new AiCallError("BAD_JSON", usage);
  }
}
