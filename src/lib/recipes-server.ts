import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RECIPE_COLUMNS, type SavedRecipe } from "./recipes";
import { displayName } from "./reports/run";

/**
 * Every saved recipe with who saved it and whether this person hid it. Newest first.
 * Returns an empty list if the recipes table isn't there yet (migration not run) instead of failing the screen.
 */
export async function loadRecipes(supabase: SupabaseClient, userId: string): Promise<SavedRecipe[]> {
  // One round: recipes, this person's hides, and everyone's names (a handful of people; profiles are private, so via the server key).
  const namesQuery = process.env.SUPABASE_SECRET_KEY
    ? import("./supabase/admin").then(({ createAdminClient }) => createAdminClient().from("profiles").select("id, display_name, email"))
    : Promise.resolve({ data: [] as { id: string; display_name: string | null; email: string }[] });
  const [recipesRes, hidesRes, namesRes] = await Promise.all([
    supabase.from("recipes").select(RECIPE_COLUMNS).order("created_at", { ascending: false }),
    supabase.from("recipe_hides").select("recipe_id").eq("user_id", userId),
    namesQuery,
  ]);
  if (recipesRes.error) {
    console.error("recipes load failed", recipesRes.error.message);
    return [];
  }
  const rows = recipesRes.data ?? [];
  const hidden = new Set((hidesRes.data ?? []).map((h) => h.recipe_id as string));

  const names = new Map<string, string>();
  for (const p of namesRes.data ?? []) names.set(p.id as string, displayName(p as { display_name: string | null; email: string }));

  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    description: r.description as string,
    portions: Number(r.portions),
    total_kcal: Number(r.total_kcal),
    total_protein_g: r.total_protein_g == null ? null : Number(r.total_protein_g),
    cooked_weight_g: r.cooked_weight_g == null ? null : Number(r.cooked_weight_g),
    items: (r.items ?? []) as SavedRecipe["items"],
    assumptions: (r.assumptions as string | null) || null,
    created_at: r.created_at as string,
    owner: names.get(r.user_id as string) ?? "?",
    mine: r.user_id === userId,
    hidden: hidden.has(r.id as string),
  }));
}
