/** A saved recipe as the screens use it (shared between everyone; hides are per person). */
export interface SavedRecipe {
  id: string;
  name: string;
  description: string;
  portions: number;
  total_kcal: number;
  total_protein_g: number | null;
  cooked_weight_g: number | null;
  items: { name: string; amount: number; unit: "g" | "ml" | "pcs"; kcal: number; protein_g: number; confidence: "high" | "medium" | "low" }[];
  assumptions: string | null;
  created_at: string;
  /** Who saved it (display name). */
  owner: string;
  mine: boolean;
  hidden: boolean;
}

export const RECIPE_COLUMNS = "id, user_id, name, description, portions, total_kcal, total_protein_g, cooked_weight_g, items, assumptions, created_at";

export const perPortion = (r: Pick<SavedRecipe, "total_kcal" | "portions">) => Math.round(r.total_kcal / r.portions);
export const gramsPerPortion = (r: Pick<SavedRecipe, "cooked_weight_g" | "portions">) =>
  r.cooked_weight_g ? Math.round(r.cooked_weight_g / r.portions) : null;
