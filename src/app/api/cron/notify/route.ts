import { NextResponse, type NextRequest } from "next/server";
import { loadDay } from "@/lib/day";
import { localDate, localTime } from "@/lib/engine/dates";
import { dueNotifications } from "@/lib/notify/rules";
import { sendPush, type StoredSubscription } from "@/lib/notify/push";
import { isoWeekday, type Profile } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Called every 5 minutes by Supabase (pg_cron). Works out which reminders are
 * due for each person and sends them to every device they enabled.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();

  const { data: subs } = await admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth");
  const byUser = new Map<string, StoredSubscription[]>();
  for (const s of subs ?? []) byUser.set(s.user_id as string, [...(byUser.get(s.user_id as string) ?? []), s as StoredSubscription]);
  if (byUser.size === 0) return NextResponse.json({ users: 0, sent: 0, photosRemoved: await removeOldPhotos(admin, now) });

  const { data: profiles } = await admin.from("profiles").select("*").in("id", [...byUser.keys()]).not("onboarded_at", "is", null);

  const summary: { user: string; sent: string[] }[] = [];
  for (const profile of (profiles ?? []) as Profile[]) {
    try {
      const date = localDate(now, profile.timezone);
      const day = await loadDay(admin, profile, date, now);
      const { data: log } = await admin.from("notification_log").select("kind").eq("user_id", profile.id).eq("date", date);

      const due = dueNotifications({
        language: profile.language,
        prefs: profile.notification_prefs ?? {},
        method: profile.method,
        methodConfig: profile.method_config ?? {},
        wakeTime: profile.wake_time,
        lastMealTime: profile.last_meal_time,
        weighInDow: profile.weigh_in_dow,
        weighInTime: profile.weigh_in_time,
        localTime: localTime(now, profile.timezone),
        localWeekday: isoWeekday(date),
        hasCheckin: day.checkin != null,
        hasWeightToday: day.lastWeight?.date === date,
        waterMl: day.waterMl,
        waterTargetMl: day.waterTargetMl,
        kcalLeft: day.target ? day.target.target - day.eaten : null,
        sent: new Set((log ?? []).map((r) => r.kind as string)),
      });

      const sent: string[] = [];
      for (const n of due) {
        // Claim the slot first: the primary key makes sure a reminder goes out once, even if two runs overlap.
        const { error: claimErr } = await admin.from("notification_log").insert({ user_id: profile.id, date, kind: n.kind });
        if (claimErr) continue;
        for (const sub of byUser.get(profile.id) ?? []) {
          const r = await sendPush(admin, sub, { title: n.title, body: n.body, url: n.url, tag: n.kind });
          if (r === "gone") await admin.from("push_subscriptions").delete().eq("id", sub.id);
          if (r === "ok") await admin.from("push_subscriptions").update({ last_success_at: new Date().toISOString() }).eq("id", sub.id);
        }
        sent.push(n.kind);
      }
      summary.push({ user: profile.id.slice(0, 8), sent });
    } catch (e) {
      console.error("notify failed for user", profile.id, e);
      summary.push({ user: profile.id.slice(0, 8), sent: ["error"] });
    }
  }
  const photosRemoved = await removeOldPhotos(admin, now);
  return NextResponse.json({ at: now.toISOString(), summary, photosRemoved });
}

/** Meal photos are kept 90 days; the meal, its description and items stay forever (SPEC §7.3). */
async function removeOldPhotos(admin: ReturnType<typeof createAdminClient>, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - 90 * 24 * 3600 * 1000).toISOString();
  const { data: old } = await admin
    .from("meals")
    .select("id, photo_path")
    .not("photo_path", "is", null)
    .lt("logged_at", cutoff)
    .limit(50);
  if (!old?.length) return 0;
  const { error } = await admin.storage.from("meal-photos").remove(old.map((m) => m.photo_path as string));
  if (error) {
    console.error("photo cleanup failed", error.message);
    return 0;
  }
  await admin
    .from("meals")
    .update({ photo_path: null, photo_deleted_at: now.toISOString() })
    .in("id", old.map((m) => m.id as string));
  return old.length;
}
