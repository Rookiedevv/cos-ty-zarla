"use client";

import { useTransition } from "react";
import { deleteMeal } from "@/app/actions";
import { localTime } from "@/lib/engine/dates";
import { useT } from "@/lib/i18n/client";
import type { Meal } from "@/lib/day";
import { fmt } from "./ui";

/** Meals as a milk-bar price list: time, name, dotted leader, kcal. */
export function MealList({ meals, timezone, showEmpty = true }: { meals: Meal[]; timezone: string; showEmpty?: boolean }) {
  const t = useT();
  const [pending, start] = useTransition();

  if (meals.length === 0) return showEmpty ? <p className="text-ink-soft">{t.today.noMeals}</p> : null;

  return (
    <ul className="space-y-2.5">
      {meals.map((m) => (
        <li key={m.id} className="group">
          <div className="menu-row">
            <span className="w-11 shrink-0 text-sm tabular-nums text-ink-soft">{localTime(new Date(m.eaten_at), timezone)}</span>
            <span className="line-clamp-2 min-w-0 font-medium">{m.description}</span>
            <span className="leader" aria-hidden />
            <span className="value font-semibold">
              {fmt(m.total_kcal)} {t.common.kcal}
            </span>
          </div>
          <div className="flex items-center gap-3 pl-[3.25rem] text-xs">
            {m.outside_window && <span className="font-semibold text-mustard">{t.log.outsideWindow}</span>}
            <button
              type="button"
              disabled={pending}
              className="text-ink-soft underline underline-offset-2 hover:text-kompot"
              onClick={() => {
                if (confirm(t.log.deleteConfirm)) start(async () => void (await deleteMeal(m.id)));
              }}
            >
              {t.common.delete}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
