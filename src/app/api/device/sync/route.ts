import { NextResponse, type NextRequest } from "next/server";
import { sha256, syncSchema } from "@/lib/device";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Daily health totals from the companion app. Each call replaces the totals for the days it sends. */
export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token.length < 30) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: device } = await admin.from("device_tokens").select("id, user_id").eq("token_hash", sha256(token)).maybeSingle();
  if (!device) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = syncSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });

  const now = new Date().toISOString();
  const rows = parsed.data.days.map((d) => ({
    user_id: device.user_id,
    date: d.date,
    steps: d.steps ?? null,
    active_kcal: d.active_kcal != null ? Math.round(d.active_kcal) : null,
    exercise_minutes: d.exercise_minutes != null ? Math.round(d.exercise_minutes) : null,
    sleep_minutes: d.sleep_minutes != null ? Math.round(d.sleep_minutes) : null,
    sleep_end: d.sleep_end ?? null,
    source: "health_connect",
    updated_at: now,
  }));
  const { error } = await admin.from("health_daily").upsert(rows, { onConflict: "user_id,date" });
  if (error) return NextResponse.json({ error: "failed" }, { status: 500 });
  await admin.from("device_tokens").update({ last_sync_at: now }).eq("id", device.id);
  return NextResponse.json({ ok: true, days: rows.length });
}
