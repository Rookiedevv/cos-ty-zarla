import Link from "next/link";
import { keyPoints } from "@/lib/diet/cheatsheets";
import type { FoodFocus, Method } from "@/lib/engine/types";
import { getDict, type Lang } from "@/lib/i18n";

/** After the morning check-in: the essentials of your diet for today, collapsible, with a link to the full cheatsheet. */
export function DietReminderCard({ method, focus, lang }: { method: Method; focus: FoodFocus; lang: Lang }) {
  const t = getDict(lang);
  const points = keyPoints(method, focus, lang);
  const name = [method !== "none" ? t.methods[method][0] : null, t.focuses[focus][0]].filter(Boolean).join(" · ");
  return (
    <details open className="group rounded-2xl panel-frame bg-enamel p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span>
          <span className="board block text-xl">{t.guide.todayTitle}</span>
          <span className="block text-sm text-ink-soft">{name}</span>
        </span>
        <svg aria-hidden viewBox="0 0 24 24" className="size-5 shrink-0 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <ul className="mt-3 space-y-1.5">
        {points.map((p) => (
          <li key={p} className="flex gap-2">
            <span aria-hidden className="w-4 shrink-0 text-center font-bold text-accent">✓</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <Link href="/guide" className="mt-3 inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-2">
        {t.guide.full}
      </Link>
    </details>
  );
}
