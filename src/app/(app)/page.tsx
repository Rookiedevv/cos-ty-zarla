import { TodayView } from "@/components/today-view";
import { loadDay, todayFor } from "@/lib/day";
import { requireOnboardedUser } from "@/lib/session";

export default async function TodayPage() {
  const { supabase, profile } = await requireOnboardedUser();
  const day = await loadDay(supabase, profile, todayFor(profile));
  return <TodayView day={day} lang={profile.language} timezone={profile.timezone} />;
}
