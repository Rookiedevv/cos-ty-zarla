import { AiMealFlow } from "@/components/ai-meal-flow";
import { todayFor } from "@/lib/day";
import { requireOnboardedUser } from "@/lib/session";

export default async function LogPage() {
  const { profile } = await requireOnboardedUser();
  return <AiMealFlow today={todayFor(profile)} showProtein={profile.food_focus === "high_protein"} />;
}
