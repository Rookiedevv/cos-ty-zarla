import { CheckinForm, type PlannedWorkout } from "@/components/checkin-form";
import { todayFor } from "@/lib/day";
import { requireOnboardedUser } from "@/lib/session";

export default async function CheckinPage() {
  const { supabase, profile } = await requireOnboardedUser();
  const date = todayFor(profile);
  const [{ data }, { data: health }, { data: workouts }, { data: devices }, { data: weight }] = await Promise.all([
    supabase.from("checkins").select("sleep_hours, rest_day").eq("user_id", profile.id).eq("date", date).maybeSingle(),
    supabase.from("health_daily").select("sleep_minutes").eq("user_id", profile.id).eq("date", date).maybeSingle(),
    supabase.from("workouts").select("kind, minutes, effort, description, kcal").eq("user_id", profile.id).eq("date", date).order("created_at"),
    supabase.from("device_tokens").select("id").eq("user_id", profile.id).limit(1),
    supabase.from("weights").select("kg").eq("user_id", profile.id).order("date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return (
    <CheckinForm
      initial={data}
      initialWorkouts={(workouts ?? []) as PlannedWorkout[]}
      watchSleepMinutes={(health?.sleep_minutes as number | null) ?? null}
      hasWatch={(devices ?? []).length > 0}
      weightKg={weight ? Number(weight.kg) : 80}
    />
  );
}
