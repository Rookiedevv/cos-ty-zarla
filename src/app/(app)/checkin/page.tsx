import { CheckinForm } from "@/components/checkin-form";
import { todayFor } from "@/lib/day";
import { requireOnboardedUser } from "@/lib/session";

export default async function CheckinPage() {
  const { supabase, profile } = await requireOnboardedUser();
  const { data } = await supabase
    .from("checkins")
    .select("sleep_hours, planned_activity")
    .eq("date", todayFor(profile))
    .maybeSingle();
  return <CheckinForm initial={data} />;
}
