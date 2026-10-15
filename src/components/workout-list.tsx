"use client";

import { useOptimistic, useState, useTransition } from "react";
import { deleteWorkout } from "@/app/actions";
import type { Workout } from "@/lib/day";
import { useT } from "@/lib/i18n/client";
import { withTimeout } from "./long-wait";
import { fmt } from "./ui";

/** Today's planned workouts as a price-list: name, dotted leader, kcal. Tap a long name to see all of it. */
export function WorkoutList({ workouts, restDay }: { workouts: Workout[]; restDay: boolean }) {
  const t = useT();
  const c = t.checkin;
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<string | null>(null);
  const [shown, hide] = useOptimistic(workouts, (cur, id: string) => cur.filter((w) => w.id !== id));
  const [failed, setFailed] = useState(false);
  const remove = (id: string) =>
    start(async () => {
      setFailed(false);
      hide(id);
      const r = await withTimeout(deleteWorkout(id));
      if (r === "timeout" || !r.ok) setFailed(true);
    });
  const failure = failed && !pending ? <p role="alert" className="mb-2 text-sm text-kompot">{t.wait.failed}</p> : null;

  if (!shown.length)
    return (
      <>
        {failure}
        <p className="text-ink-soft">{restDay ? c.restDay : c.needPlan}</p>
      </>
    );
  return (
    <>
      {failure}
      <ul className="space-y-2.5">
      {shown.map((w) => (
        <li key={w.id}>
          <button
            type="button"
            aria-expanded={open === w.id}
            onClick={() => setOpen(open === w.id ? null : w.id)}
            className={`menu-row -mx-2 w-[calc(100%+1rem)] rounded-lg px-2 py-1 text-left hover:bg-tile ${open === w.id ? "flex-wrap" : ""}`}
          >
            <span className={`min-w-0 font-medium ${open === w.id ? "order-last basis-full break-words" : "truncate"}`}>
              {w.kind === "other" && w.description ? w.description : c.kinds[w.kind]}, {w.minutes} min
              {w.effort ? ` · ${c.efforts[w.effort][0].toLowerCase()}` : ""}
            </span>
            <span className="leader" aria-hidden />
            <span className="value font-semibold">
              +{fmt(w.kcal)} {t.common.kcal}
            </span>
          </button>
          <button
            type="button"
            className="-my-2 px-1 py-2 text-xs text-ink-soft underline underline-offset-2 hover:text-kompot"
            onClick={() => {
              if (confirm(`${c.remove}?`)) remove(w.id);
            }}
          >
            {c.remove}
          </button>
        </li>
      ))}
      </ul>
    </>
  );
}
