import "server-only";

/** A packaged product from Open Food Facts (free, good Polish coverage). */
export interface Product {
  barcode: string;
  name: string;
  brand: string | null;
  kcalPer100: number | null;
  proteinPer100: number | null;
  servingSize: string | null;
  packageSize: string | null;
}

export async function lookupBarcode(barcode: string): Promise<Product | null> {
  if (!/^\d{8,14}$/.test(barcode)) return null;
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,product_name_pl,brands,nutriments,serving_size,quantity`,
      { headers: { "User-Agent": "CosTyZarla/1.0 (private two-person app)" }, signal: AbortSignal.timeout(6000), cache: "no-store" },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status?: number;
      product?: {
        product_name?: string;
        product_name_pl?: string;
        brands?: string;
        serving_size?: string;
        quantity?: string;
        nutriments?: Record<string, number | string | undefined>;
      };
    };
    if (json.status !== 1 || !json.product) return null;
    const p = json.product;
    const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)) ? Number(v) : null);
    const kcal = num(p.nutriments?.["energy-kcal_100g"]) ?? (num(p.nutriments?.["energy_100g"]) != null ? num(p.nutriments?.["energy_100g"])! / 4.184 : null);
    return {
      barcode,
      name: p.product_name_pl || p.product_name || barcode,
      brand: p.brands?.split(",")[0]?.trim() || null,
      kcalPer100: kcal != null ? Math.round(kcal) : null,
      proteinPer100: num(p.nutriments?.["proteins_100g"]),
      servingSize: p.serving_size || null,
      packageSize: p.quantity || null,
    };
  } catch {
    return null;
  }
}
