import { en, type Dict } from "./en";
import { pl } from "./pl";

export type Lang = "en" | "pl";
export const dictionaries: Record<Lang, Dict> = { en, pl };
export const getDict = (lang: string | null | undefined): Dict => dictionaries[lang === "en" ? "en" : "pl"];
export type { Dict };
