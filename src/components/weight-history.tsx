"use client";

import { useTransition } from "react";
import { deleteWeight } from "@/app/actions";
import { useT, useLang } from "@/lib/i18n/client";
import { Panel, PanelTitle } from "./ui";
import { WeightChart, type WeightPoint } from "./weight-chart";

/** Chart of weigh-ins plus the full list with change vs previous and since start. Newest first in the list. */
export function WeightHistory({ points }: { points: WeightPoint[] }) {
  const t = useT();
  const h = t.history;
  const lang = useLang();
  const locale = lang === "en" ? "en-GB" : "pl-PL";
  const [pending, start] = useTransition();

  if (points.length === 0) {
    return (
      <Panel>
        <p className="text-ink-soft">{h.weightEmpty}</p>
      </Panel>
    );
  }

  const kg = (n: number, signed = false) =>
    `${signed && n > 0 ? "+" : n < 0 ? "−" : ""}${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(n))}`;
  const date = (d: string) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  const first = points[0].kg;
  const latest = points[points.length - 1].kg;

  return (
    <>
      <Panel>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <PanelTitle>{h.weightChart}</PanelTitle>
          {points.length > 1 && <p className="shrink-0 text-sm font-semibold">{h.sinceStart(kg(latest - first, true))}</p>}
        </div>
        <WeightChart points={points} lang={lang} title={h.weightChart} />
      </Panel>

      <Panel>
        <PanelTitle>{h.weightList}</PanelTitle>
        <ul className="divide-y divide-grout">
          {[...points].reverse().map((p, idx, arr) => {
            const prev = arr[idx + 1];
            const diff = prev ? p.kg - prev.kg : null;
            return (
              <li key={p.date} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block font-semibold first-letter:uppercase">{date(p.date)}</span>
                  <span className="block text-sm text-ink-soft">
                    {diff == null ? h.first : `${kg(diff, true)} kg ${h.vsPrevious}`}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="board text-xl tabular-nums">{kg(p.kg)} kg</span>
                  <button
                    type="button"
                    disabled={pending}
                    className="min-h-11 px-1 text-sm text-ink-soft underline underline-offset-2 hover:text-kompot"
                    onClick={() => {
                      if (confirm(h.deleteWeightConfirm(kg(p.kg), date(p.date)))) start(async () => void (await deleteWeight(p.date)));
                    }}
                  >
                    {h.deleteWeight}
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      </Panel>
    </>
  );
}
