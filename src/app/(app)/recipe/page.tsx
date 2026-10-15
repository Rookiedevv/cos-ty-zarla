import { RecipeFlow } from "@/components/recipe-flow";
import { requireOnboardedUser } from "@/lib/session";

export default async function RecipePage() {
  const { profile } = await requireOnboardedUser();
  return <RecipeFlow showProtein={profile.food_focus === "high_protein"} />;
}
