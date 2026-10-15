import { AiMealFlow } from "@/components/ai-meal-flow";
import { todayFor } from "@/lib/day";
import { loadRecipes } from "@/lib/recipes-server";
import { requireOnboardedUser } from "@/lib/session";

export default async function LogPage() {
  const { supabase, profile } = await requireOnboardedUser();
  const recipes = (await loadRecipes(supabase, profile.id)).filter((r) => !r.hidden);
  return <AiMealFlow today={todayFor(profile)} showProtein={profile.food_focus === "high_protein"} recipes={recipes} />;
}
