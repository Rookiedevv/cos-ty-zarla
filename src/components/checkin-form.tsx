"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveCheckin } from "@/app/actions";
import type { PlannedActivity } from "@/lib/engine/types";
import { useT } from "@/lib/i18n/client";
import { Button, ChoiceGroup, Panel } from "./ui";

/** Sleep buckets → representative hours stored in the check-in. */
const SLEEP_VALUES = ["4.5", "5.5", "6.5", "7.5", "8.5"] as const;
type SleepValue = (typeof SLEEP_VALUES)[number];

function toBucket(hours: number | null | undefined): SleepValue | null {
  if (hours == null) return null;
  if (hours < 5) return "4.5";
  if (hours < 6) return "5.5";
  if (hours < 7) return "6.5";
  if (hours < 8) return "7.5";
  return "8.5";
}

export function CheckinForm({
  initial,
  watchSleepMinutes = null,
}: {
  initial: { sleep_hours: number | null; planned_activity: PlannedActivity } | null;
  /** Last night's sleep from the watch, used to pre-fill the answer. */
  watchSleepMinutes?: number | null;
}) {
  const t = useT();
  const router = useRouter();
  const fromWatch = initial?.sleep_hours == null && watchSleepMinutes != null && watchSleepMinutes > 0;
  const [sleep, setSleep] = useState<SleepValue | null>(toBucket(fromWatch ? watchSleepMinutes! / 60 : initial?.sleep_hours));
  const [activity, setActivity] = useState<PlannedActivity | null>(initial?.planned_activity ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <main className="space-y-4 pt-2">
      <h1 className="board text-3xl">{t.checkin.title}</h1>
      <Panel as="form" className="space-y-6">
        {fromWatch && (
          <p className="-mb-3 text-sm font-semibold text-accent">
            {t.watch.sleepFromWatch(Math.floor(watchSleepMinutes! / 60), watchSleepMinutes! % 60)}
          </p>
        )}
        <ChoiceGroup
          name="sleep"
          legend={t.checkin.sleepQ}
          columns={5}
          value={sleep}
          onChange={setSleep}
          choices={SLEEP_VALUES.map((v, i) => ({ value: v, label: t.checkin.sleepOpts[i] }))}
        />
        <ChoiceGroup
          name="activity"
          legend={t.checkin.activityQ}
          columns={2}
          value={activity}
          onChange={setActivity}
          choices={(["rest", "light", "moderate", "hard"] as const).map((a) => ({
            value: a,
            label: t.checkin.activity[a][0],
            desc: t.checkin.activity[a][1],
          }))}
        />
        {error && <p className="text-sm text-kompot">{error}</p>}
        <Button
          type="button"
          className="w-full"
          disabled={!sleep || !activity || pending}
          onClick={() =>
            start(async () => {
              // Keep the watch's exact figure when the person kept the pre-filled answer.
              const exact = fromWatch && toBucket(watchSleepMinutes! / 60) === sleep ? Math.round((watchSleepMinutes! / 60) * 10) / 10 : null;
              const r = await saveCheckin({ sleep_hours: exact ?? (sleep ? Number(sleep) : null), planned_activity: activity! });
              if (r.ok) router.push("/");
              else setError(t.common.errorGeneric);
            })
          }
        >
          {pending ? t.common.saving : t.checkin.save}
        </Button>
      </Panel>
    </main>
  );
}
