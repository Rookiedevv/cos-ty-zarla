import { LogMealForm } from "@/components/log-meal-form";
import { todayFor } from "@/lib/day";
import { requireOnboardedUser } from "@/lib/session";

export default async function LogPage() {
  const { profile } = await requireOnboardedUser();
  return <LogMealForm today={todayFor(profile)} showProtein={profile.food_focus === "high_protein"} />;
}
