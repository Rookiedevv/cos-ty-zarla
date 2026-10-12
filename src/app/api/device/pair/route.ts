import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { newDeviceToken, normalizeCode, sha256 } from "@/lib/device";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** The companion app trades a one-time code from Settings for its own long-lived token. */
export async function POST(request: NextRequest) {
  const body = z.object({ code: z.string().max(20), label: z.string().max(80).optional() }).safeParse(await request.json().catch(() => null));
  const code = body.success ? normalizeCode(body.data.code) : null;
  if (!code) return NextResponse.json({ error: "invalid_code" }, { status: 400 });

  const admin = createAdminClient();
  const now = new Date().toISOString();
  // Mark the code used in the same statement that checks it, so it can only be redeemed once.
  const { data: claimed } = await admin
    .from("pairing_codes")
    .update({ used_at: now })
    .eq("code_hash", sha256(code))
    .is("used_at", null)
    .gt("expires_at", now)
    .select("user_id")
    .maybeSingle();
  if (!claimed) return NextResponse.json({ error: "invalid_code" }, { status: 400 });

  const token = newDeviceToken();
  const { error } = await admin.from("device_tokens").insert({
    user_id: claimed.user_id,
    token_hash: sha256(token),
    label: body.success ? body.data.label?.trim() || "Android" : "Android",
  });
  if (error) return NextResponse.json({ error: "failed" }, { status: 500 });
  return NextResponse.json({ token });
}
