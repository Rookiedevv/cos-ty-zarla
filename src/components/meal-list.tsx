"use client";

import { useState, useTransition } from "react";
import { deleteMeal } from "@/app/actions";
import { localTime } from "@/lib/engine/dates";
import { useLang, useT } from "@/lib/i18n/client";
import type { Meal } from "@/lib/day";
import { fmt } from "./ui";

/**
 * Meals as a price list: time, name, dotted leader, kcal.
 * Long names show two lines; tap a meal to see the full name, its items and the diet note.
 */
export function MealList({ meals, timezone, showEmpty = true }: { meals: Meal[]; timezone: string; showEmpty?: boolean }) {
  const t = useT();
  const lang = useLang();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  if (meals.length === 0) return showEmpty ? <p className="text-ink-soft">{t.today.noMeals}</p> : null;

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const num = (n: number) => new Intl.NumberFormat(lang === "en" ? "en-GB" : "pl-PL", { maximumFractionDigits: 1 }).format(n);

  return (
    <ul className="space-y-1">
      {meals.map((m) => {
        const isOpen = open.has(m.id);
        const items = [...(m.meal_items ?? [])].sort((a, b) => a.position - b.position);
        const panelId = `meal-${m.id}`;
        return (
          <li key={m.id}>
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => toggle(m.id)}
              className={`menu-row -mx-2 w-[calc(100%+1rem)] rounded-lg px-2 py-1.5 text-left hover:bg-tile ${isOpen ? "flex-wrap" : ""}`}
            >
              <span className="w-11 shrink-0 text-sm tabular-nums text-ink-soft">{localTime(new Date(m.eaten_at), timezone)}</span>
              <span className={`min-w-0 font-medium ${isOpen ? "order-last basis-full break-words pl-[3.25rem]" : "line-clamp-2"}`}>{m.description}</span>
              <span className="leader" aria-hidden />
              <span className="value font-semibold">
                {fmt(m.total_kcal)} {t.common.kcal}
              </span>
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className={`size-4 shrink-0 self-center text-ink-soft transition-transform ${isOpen ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {!isOpen && m.outside_window && <p className="pl-[3.25rem] text-xs font-semibold text-mustard">{t.log.outsideWindow}</p>}

            {isOpen && (
              <div id={panelId} className="mb-2 ml-[3.25rem] space-y-2 border-l-2 border-grout pl-3 text-sm">
                {items.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{t.log.items}</p>
                    <ul className="mt-1 space-y-1">
                      {items.map((i, idx) => (
                        <li key={idx} className="menu-row">
                          <span className="min-w-0 break-words">
                            {i.name}
                            {i.amount != null && (
                              <span className="text-ink-soft">
                                {" "}
                                · {num(Number(i.amount))} {i.unit === "pcs" ? t.ai.pcs : (i.unit ?? "")}
                              </span>
                            )}
                          </span>
                          <span className="leader" aria-hidden />
                          <span className="value tabular-nums">
                            {fmt(i.kcal)} {t.common.kcal}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {m.verdict && <p className="text-ink-soft">{m.verdict}</p>}
                <div className="flex items-center gap-3 text-xs">
                  {m.outside_window && <span className="font-semibold text-mustard">{t.log.outsideWindow}</span>}
                  <button
                    type="button"
                    disabled={pending}
                    className="-my-2 px-1 py-2 text-ink-soft underline underline-offset-2 hover:text-kompot"
                    onClick={() => {
                      if (confirm(t.log.deleteConfirm)) start(async () => void (await deleteMeal(m.id)));
                    }}
                  >
                    {t.common.delete}
                  </button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
