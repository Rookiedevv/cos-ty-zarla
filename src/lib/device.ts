import "server-only";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { z } from "zod";

/** Letters and digits that can't be confused when typed on a phone (no 0/O, 1/I/L). */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const PAIRING_MINUTES = 10;

/** An 8-character code like "K7P4-2QX9": ~10^12 combinations, valid 10 minutes, single use. */
export function newPairingCode(): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Accepts the code however it was typed: any case, with or without the dash or spaces. */
export function normalizeCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length !== 8 || [...s].some((c) => !CODE_ALPHABET.includes(c))) return null;
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export const newDeviceToken = () => randomBytes(32).toString("base64url");
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const day = z.object({
  date: z.iso.date(),
  steps: z.number().int().min(0).max(200_000).nullable().optional(),
  active_kcal: z.number().min(0).max(20_000).nullable().optional(),
  exercise_minutes: z.number().min(0).max(1440).nullable().optional(),
  sleep_minutes: z.number().min(0).max(1440).nullable().optional(),
  sleep_end: z.iso.datetime({ offset: true }).nullable().optional(),
});

export const syncSchema = z.object({
  app_version: z.string().max(30).optional(),
  days: z.array(day).min(1).max(7),
});
export type SyncDay = z.infer<typeof day>;
