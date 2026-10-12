import { CheckinForm } from "@/components/checkin-form";
import { todayFor } from "@/lib/day";
import { requireOnboardedUser } from "@/lib/session";

export default async function CheckinPage() {
  const { supabase, profile } = await requireOnboardedUser();
  const date = todayFor(profile);
  const [{ data }, { data: health }] = await Promise.all([
    supabase.from("checkins").select("sleep_hours, planned_activity").eq("user_id", profile.id).eq("date", date).maybeSingle(),
    supabase.from("health_daily").select("sleep_minutes").eq("user_id", profile.id).eq("date", date).maybeSingle(),
  ]);
  return <CheckinForm initial={data} watchSleepMinutes={(health?.sleep_minutes as number | null) ?? null} />;
}
