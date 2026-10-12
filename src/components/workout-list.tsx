"use client";

import { useTransition } from "react";
import { deleteWorkout } from "@/app/actions";
import type { Workout } from "@/lib/day";
import { useT } from "@/lib/i18n/client";
import { fmt } from "./ui";

/** Today's planned workouts as a price-list: name, dotted leader, kcal. */
export function WorkoutList({ workouts, restDay }: { workouts: Workout[]; restDay: boolean }) {
  const t = useT();
  const c = t.checkin;
  const [pending, start] = useTransition();

  if (!workouts.length) return <p className="text-ink-soft">{restDay ? c.restDay : c.needPlan}</p>;
  return (
    <ul className="space-y-2.5">
      {workouts.map((w) => (
        <li key={w.id}>
          <div className="menu-row">
            <span className="min-w-0 truncate font-medium">
              {w.kind === "other" && w.description ? w.description : c.kinds[w.kind]}, {w.minutes} min
              {w.effort ? ` · ${c.efforts[w.effort][0].toLowerCase()}` : ""}
            </span>
            <span className="leader" aria-hidden />
            <span className="value font-semibold">
              +{fmt(w.kcal)} {t.common.kcal}
            </span>
          </div>
          <button
            type="button"
            disabled={pending}
            className="-my-2 px-1 py-2 text-xs text-ink-soft underline underline-offset-2 hover:text-kompot"
            onClick={() => {
              if (confirm(`${c.remove}?`)) start(async () => void (await deleteWorkout(w.id)));
            }}
          >
            {c.remove}
          </button>
        </li>
      ))}
    </ul>
  );
}
