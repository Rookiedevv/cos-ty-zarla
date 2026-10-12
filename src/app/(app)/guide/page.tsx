import Link from "next/link";
import { CheatsheetCard } from "@/components/cheatsheet";
import { FOCUS_SHEETS, METHOD_SHEETS } from "@/lib/diet/cheatsheets";
import type { FoodFocus, Method } from "@/lib/engine/types";
import { getDict } from "@/lib/i18n";
import { requireOnboardedUser } from "@/lib/session";

const METHODS = Object.keys(METHOD_SHEETS) as Method[];
const FOCUSES = Object.keys(FOCUS_SHEETS) as FoodFocus[];

/**
 * Without parameters: your own method and food focus.
 * With ?method=… or ?focus=…: any other one, so you can read before switching.
 */
export default async function GuidePage({ searchParams }: { searchParams: Promise<{ method?: string; focus?: string; from?: string }> }) {
  const { profile } = await requireOnboardedUser();
  const sp = await searchParams;
  const lang = profile.language;
  const t = getDict(lang);
  const g = t.guide;

  const method = METHODS.includes(sp.method as Method) ? (sp.method as Method) : null;
  const focus = FOCUSES.includes(sp.focus as FoodFocus) ? (sp.focus as FoodFocus) : null;
  const showOwn = !method && !focus;
  const backHref = sp.from === "settings" ? "/settings?tab=diet" : "/";

  return (
    <main className="space-y-4 pt-2">
      <Link href={backHref} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline underline-offset-2">
        ← {g.back}
      </Link>
      <h1 className="board text-3xl">{showOwn ? g.yours : g.title}</h1>

      {(showOwn || method) && (
        <CheatsheetCard
          eyebrow={g.method}
          name={t.methods[method ?? profile.method][0]}
          sheet={METHOD_SHEETS[method ?? profile.method][lang]}
          lang={lang}
          current={(method ?? profile.method) === profile.method}
        />
      )}
      {(showOwn || focus) && (
        <CheatsheetCard
          eyebrow={g.focus}
          name={t.focuses[focus ?? profile.food_focus][0]}
          sheet={FOCUS_SHEETS[focus ?? profile.food_focus][lang]}
          lang={lang}
          current={(focus ?? profile.food_focus) === profile.food_focus}
        />
      )}

      <p className="text-center text-xs text-ink-soft">{g.disclaimer}</p>
    </main>
  );
}
