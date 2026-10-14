import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "../email";
import { sendPush, type StoredSubscription } from "../notify/push";
import { STOP_USD, WARN_USD, alertsToSend, monthStart } from "./budget";

/**
 * Tells the admin when this month's AI spend passes $5 (keeps working) or $10
 * (AI paused until next month). Each alert goes out once per month: by email
 * when email sending is set up, and always as a phone reminder.
 */
export async function checkCostAlerts(admin: SupabaseClient, spent: number) {
  const month = monthStart();
  const { data: sent } = await admin.from("cost_alerts").select("level").eq("month", month);
  const levels = alertsToSend(spent, new Set((sent ?? []).map((r) => r.level as string)));
  if (!levels.length) return;

  const { data: admins } = await admin.from("profiles").select("id, email, language").eq("is_admin", true);
  for (const level of levels) {
    const { error } = await admin.from("cost_alerts").insert({ month, level });
    if (error) continue; // another request already sent it

    for (const a of admins ?? []) {
      const pl = a.language !== "en";
      const title = level === "warn"
        ? (pl ? `AI: wydano ponad $${WARN_USD} w tym miesiącu` : `AI spend passed $${WARN_USD} this month`)
        : (pl ? `AI wstrzymane: limit $${STOP_USD}` : `AI paused: $${STOP_USD} limit reached`);
      const body = level === "warn"
        ? (pl ? `Obecnie $${spent.toFixed(2)}. Szacowanie działa dalej, do limitu $${STOP_USD}.` : `Now $${spent.toFixed(2)}. Estimates keep working up to $${STOP_USD}.`)
        : (pl ? `Szacowanie przez AI wróci 1. dnia przyszłego miesiąca. Ręczne dodawanie działa.` : `AI estimates return on the 1st of next month. Manual logging still works.`);

      await sendEmail({ to: a.email as string, subject: title, text: body, html: `<p>${body}</p>` });
      const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", a.id);
      for (const s of (subs ?? []) as StoredSubscription[]) await sendPush(admin, s, { title, body, url: "/settings", tag: `cost-${level}` });
    }
  }
}
