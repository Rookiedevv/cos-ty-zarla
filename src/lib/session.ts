import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "./supabase/server";
import type { Profile } from "./profile";

/** The signed-in user's Supabase client and profile. Redirects when signed out. */
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).single<Profile>();
  if (!profile) redirect("/login");
  return { supabase, profile };
});

/** Same as requireUser, but also sends people who haven't finished onboarding to it. */
export async function requireOnboardedUser() {
  const ctx = await requireUser();
  if (!ctx.profile.onboarded_at) redirect("/onboarding");
  return ctx;
}
