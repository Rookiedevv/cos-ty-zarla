import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** USD per million tokens. Haiku 5.5 prices apply to prompts up to 100k tokens, which every meal estimate is. */
export const PRICES: Record<string, { in: number; out: number }> = {
  "claude-haiku-5-5": { in: 0.1, out: 0.5 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-opus-5-5": { in: 4, out: 20 },
};

/** Monthly spending limits for both people together (SPEC §12). */
export const WARN_USD = 5;
export const STOP_USD = 10;

export function costOf(model: string, tokensIn: number, tokensOut: number): number {
  const p = PRICES[model] ?? PRICES["claude-sonnet-5-5"]; // unknown model: assume the pricier rate
  return (tokensIn * p.in + tokensOut * p.out) / 1_000_000;
}

export function monthStart(now = new Date()): string {
  return `${now.toISOString().slice(0, 7)}-01`;
}

export async function spentThisMonth(admin: SupabaseClient, now = new Date()): Promise<number> {
  const { data } = await admin.from("ai_usage").select("cost_usd").gte("at", `${monthStart(now)}T00:00:00Z`);
  return (data ?? []).reduce((s, r) => s + Number(r.cost_usd), 0);
}

/** Which alert levels a spend crosses that haven't been sent yet. Pure, for testing. */
export function alertsToSend(spent: number, alreadySent: Set<string>): ("warn" | "stop")[] {
  const out: ("warn" | "stop")[] = [];
  if (spent >= WARN_USD && !alreadySent.has("warn")) out.push("warn");
  if (spent >= STOP_USD && !alreadySent.has("stop")) out.push("stop");
  return out;
}
