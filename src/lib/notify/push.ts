import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

let cached: VapidKeys | null = null;

/** The app's public address, used as the contact in push signatures. */
export function siteUrl() {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return host ? `https://${host}` : "https://cos-ty-zarla.vercel.app";
}

/**
 * The key pair that signs push messages. Created on first use and kept in the
 * private app_secrets table, so nobody has to generate or paste it by hand.
 */
export async function getVapidKeys(admin: SupabaseClient): Promise<VapidKeys> {
  if (cached) return cached;
  const { data } = await admin.from("app_secrets").select("value").eq("name", "vapid").maybeSingle();
  if (data) return (cached = JSON.parse(data.value as string));

  const fresh = webpush.generateVAPIDKeys();
  // If two requests race, the first insert wins and both read it back.
  await admin.from("app_secrets").upsert({ name: "vapid", value: JSON.stringify(fresh) }, { onConflict: "name", ignoreDuplicates: true });
  const { data: stored } = await admin.from("app_secrets").select("value").eq("name", "vapid").single();
  return (cached = JSON.parse(stored!.value as string));
}

export interface StoredSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

/**
 * Sends one message to one device. Returns "gone" when the browser has
 * dropped the subscription (the caller deletes it), otherwise ok/failed.
 */
export async function sendPush(admin: SupabaseClient, sub: StoredSubscription, payload: PushPayload): Promise<"ok" | "gone" | "failed"> {
  const keys = await getVapidKeys(admin);
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      {
        vapidDetails: { subject: siteUrl(), publicKey: keys.publicKey, privateKey: keys.privateKey },
        TTL: 60 * 60,
        urgency: "normal",
      },
    );
    return "ok";
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    console.error("push failed", status, (e as Error).message);
    return "failed";
  }
}
