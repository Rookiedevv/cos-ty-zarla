"use client";

import { useOptimistic, useState, useTransition } from "react";
import { addWater } from "@/app/actions";
import { useT } from "@/lib/i18n/client";
import { withTimeout } from "./long-wait";
import { Panel, Spinner, fmt } from "./ui";

export function WaterPanel({ ml, target }: { ml: number; target: number }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [shown, addShown] = useOptimistic(ml, (cur, delta: number) => Math.max(0, cur + delta));
  const pct = Math.min(100, (shown / target) * 100);

  const [failed, setFailed] = useState(false);
  // The amount changes at once; if saving fails it goes back and says so.
  const add = (delta: number) =>
    start(async () => {
      setFailed(false);
      addShown(delta);
      const r = await withTimeout(addWater(delta));
      if (r === "timeout" || !r.ok) setFailed(true);
    });

  return (
    <Panel>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="board text-xl">{t.today.water}</h2>
        <p className="flex items-center gap-1.5 tabular-nums">
          <span aria-hidden className={`inline-flex transition-opacity ${pending ? "opacity-100" : "opacity-0"}`}>
            <Spinner className="size-3.5 text-water" />
          </span>
          <span className="font-semibold">{fmt(shown)}</span> / {fmt(target)} {t.common.ml}
        </p>
      </div>
      <div className="mb-3 h-3 overflow-hidden rounded-full border-2 border-water bg-water-bg">
        <div className="h-full bg-water" style={{ width: `${pct}%` }} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[250, 500].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => add(v)}
            className="min-h-12 rounded-xl border-2 border-water font-semibold text-water hover:bg-water-bg"
          >
            {t.today.addWater(v)} {t.common.ml}
          </button>
        ))}
        <button
          type="button"
          disabled={pending || shown <= 0}
          onClick={() => add(-250)}
          className="min-h-12 rounded-xl border-2 border-grout text-ink-soft disabled:opacity-40"
        >
          −250 {t.common.ml}
        </button>
      </div>
      {failed && !pending && <p role="alert" className="mt-2 text-sm text-kompot">{t.wait.failed}</p>}
    </Panel>
  );
}
