import { RecipeFlow } from "@/components/recipe-flow";
import { SavedRecipes } from "@/components/saved-recipes";
import { TabLink } from "@/components/tab-link";
import { getDict } from "@/lib/i18n";
import { loadRecipes } from "@/lib/recipes-server";
import { requireOnboardedUser } from "@/lib/session";

type Tab = "new" | "saved";

export default async function RecipePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { supabase, profile } = await requireOnboardedUser();
  const tab: Tab = (await searchParams).tab === "saved" ? "saved" : "new";
  const t = getDict(profile.language);

  return (
    <main className="space-y-4 pt-2">
      <h1 className="board text-3xl">{t.recipe.title}</h1>
      <nav aria-label={t.recipe.title} className="grid grid-cols-2 gap-1 rounded-2xl bg-grout p-1">
        <TabLink href="/recipe" active={tab === "new"}>{t.recipe.tabNew}</TabLink>
        <TabLink href="/recipe?tab=saved" active={tab === "saved"}>{t.recipe.tabSaved}</TabLink>
      </nav>
      {tab === "new" ? (
        <RecipeFlow showProtein={profile.food_focus === "high_protein"} />
      ) : (
        <SavedRecipes recipes={await loadRecipes(supabase, profile.id)} />
      )}
    </main>
  );
}
