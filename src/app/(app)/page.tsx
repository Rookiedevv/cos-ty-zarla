import { TodayView } from "@/components/today-view";
import { loadDay, todayFor } from "@/lib/day";
import { requireOnboardedUser } from "@/lib/session";

export default async function TodayPage() {
  const { supabase, profile } = await requireOnboardedUser();
  const day = await loadDay(supabase, profile, todayFor(profile), new Date(), "after");
  return <TodayView day={day} lang={profile.language} timezone={profile.timezone} diet={{ method: profile.method, focus: profile.food_focus }} />;
}
