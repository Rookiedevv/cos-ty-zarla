"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { estimateWorkoutAction, saveCheckin, type WorkoutInput } from "@/app/actions";
import { workoutKcal } from "@/lib/engine/target";
import type { Effort, WorkoutKind } from "@/lib/engine/types";
import { useT } from "@/lib/i18n/client";
import { LongWait, WaitFailed, withTimeout } from "./long-wait";
import { Button, ChoiceGroup, Notice, Panel, fmt, inputClass } from "./ui";

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

const KINDS: WorkoutKind[] = ["walk", "run", "gym", "bike", "football", "swim", "other"];
const MINUTES = [15, 30, 45, 60, 90];

export interface PlannedWorkout {
  kind: WorkoutKind;
  minutes: number;
  effort: Effort | null;
  description: string | null;
  kcal: number;
}

export function CheckinForm({
  initial,
  initialWorkouts = [],
  watchSleepMinutes = null,
  hasWatch,
  weightKg,
}: {
  initial: { sleep_hours: number | null; rest_day: boolean } | null;
  initialWorkouts?: PlannedWorkout[];
  /** Last night's sleep from the watch, used to pre-fill the answer. */
  watchSleepMinutes?: number | null;
  /** With a watch, activity comes from the watch and only sleep is asked. */
  hasWatch: boolean;
  weightKg: number;
}) {
  const t = useT();
  const c = t.checkin;
  const router = useRouter();
  const fromWatch = initial?.sleep_hours == null && watchSleepMinutes != null && watchSleepMinutes > 0;
  const [sleep, setSleep] = useState<SleepValue | null>(toBucket(fromWatch ? watchSleepMinutes! / 60 : initial?.sleep_hours));
  const [restDay, setRestDay] = useState(initial?.rest_day ?? false);
  const [workouts, setWorkouts] = useState<PlannedWorkout[]>(initialWorkouts);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const planReady = hasWatch || restDay || workouts.length > 0;
  const label = (w: PlannedWorkout) => (w.kind === "other" && w.description ? w.description : c.kinds[w.kind]);

  const save = () =>
    start(async () => {
      const exact = fromWatch && toBucket(watchSleepMinutes! / 60) === sleep ? Math.round((watchSleepMinutes! / 60) * 10) / 10 : null;
      setError(null);
      const r = await withTimeout(
        saveCheckin({
          sleep_hours: exact ?? (sleep ? Number(sleep) : null),
          rest_day: !hasWatch && restDay,
          workouts: hasWatch ? undefined : workouts.map<WorkoutInput>((w) => ({ ...w })),
        }),
      );
      if (r !== "timeout" && r.ok) router.push("/");
      else setError(t.wait.saveFailed);
    });

  return (
    <main className="space-y-4 pt-2">
      <h1 className="board text-3xl">{c.title}</h1>
      <Panel className="space-y-6">
        <div className="space-y-2">
          {fromWatch && (
            <p className="text-sm font-semibold text-accent">
              {t.watch.sleepFromWatch(Math.floor(watchSleepMinutes! / 60), watchSleepMinutes! % 60)}
            </p>
          )}
          <ChoiceGroup
            name="sleep"
            legend={c.sleepQ}
            value={sleep}
            onChange={setSleep}
            choices={SLEEP_VALUES.map((v, i) => ({ value: v, label: c.sleepOpts[i] }))}
          />
        </div>

        {hasWatch ? (
          <Notice>{c.watchNote}</Notice>
        ) : (
          <fieldset className="space-y-3">
            <legend className="mb-2 font-semibold">{c.planQ}</legend>

            {workouts.length > 0 && (
              <ul className="space-y-2">
                {workouts.map((w, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 rounded-xl border-2 border-grout px-3 py-2">
                    <span className="min-w-0">{c.workoutLine(label(w), w.minutes, w.kcal)}</span>
                    <button
                      type="button"
                      className="min-h-11 shrink-0 px-2 text-sm text-ink-soft underline hover:text-kompot"
                      onClick={() => setWorkouts((cur) => cur.filter((_, j) => j !== i))}
                    >
                      {c.remove}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {editing ? (
              <WorkoutEditor
                weightKg={weightKg}
                onCancel={() => setEditing(false)}
                onAdd={(w) => {
                  setWorkouts((cur) => [...cur, w]);
                  setRestDay(false);
                  setEditing(false);
                }}
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={restDay}
                  onClick={() => {
                    setRestDay(!restDay);
                    if (!restDay) setWorkouts([]);
                  }}
                  className={`min-h-12 flex-1 basis-auto whitespace-nowrap rounded-xl border-2 px-4 font-semibold ${
                    restDay ? "border-accent bg-accent text-on-accent" : "border-grout bg-enamel hover:border-outline"
                  }`}
                >
                  {c.restDay}
                </button>
                <Button variant="ghost" className="flex-1 basis-auto whitespace-nowrap" onClick={() => setEditing(true)}>
                  + {workouts.length ? c.addAnother : c.addWorkout}
                </Button>
              </div>
            )}
          </fieldset>
        )}

        {error && <p className="text-sm text-kompot">{error}</p>}
        {!hasWatch && !planReady && !editing && <p className="text-sm text-ink-soft">{c.needPlan}</p>}
        <Button type="button" className="w-full" loading={pending} disabled={!sleep || !planReady || editing} onClick={save}>
          {pending ? t.common.saving : c.save}
        </Button>
      </Panel>
    </main>
  );
}

function WorkoutEditor({ weightKg, onAdd, onCancel }: { weightKg: number; onAdd: (w: PlannedWorkout) => void; onCancel: () => void }) {
  const t = useT();
  const c = t.checkin;
  const ai = t.ai;
  const [kind, setKind] = useState<WorkoutKind | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [customMinutes, setCustomMinutes] = useState("");
  const [effort, setEffort] = useState<Effort | null>(null);
  const [text, setText] = useState("");
  const [estimate, setEstimate] = useState<{ label: string; minutes: number; kcal: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const mins = minutes ?? (customMinutes ? Number(customMinutes) : null);
  const quickKcal = kind && kind !== "other" && mins && effort ? workoutKcal(kind, effort, mins, weightKg) : null;

  const [attemptKey, setAttemptKey] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const runEstimate = () => {
    const id = attemptKey + 1;
    setAttemptKey(id);
    setTimedOut(false);
    start(async () => {
      setNotice(null);
      const r = await withTimeout(estimateWorkoutAction({ text, minutes: mins }));
      if (r === "timeout") return setTimedOut(true);
      if (r.ok) setEstimate({ label: r.label, minutes: r.minutes, kcal: r.kcal });
      else setNotice(r.error === "ai_paused" ? ai.paused : r.error === "not_configured" ? ai.notConfigured : ai.failed);
    });
  };

  return (
    <div className="space-y-4 rounded-xl border-2 border-accent p-3">
      <ChoiceGroup<WorkoutKind>
        name="kind"
        legend={c.kindQ}
        value={kind}
        onChange={(k) => {
          setKind(k);
          setEstimate(null);
        }}
        choices={KINDS.map((k) => ({ value: k, label: c.kinds[k] }))}
      />

      {kind === "other" && (
        <label className="block">
          <span className="mb-1 block font-semibold">{c.otherQ}</span>
          <textarea
            className={`${inputClass} min-h-20`}
            value={text}
            maxLength={300}
            placeholder={c.otherPlaceholder}
            onChange={(e) => {
              setText(e.target.value);
              setEstimate(null);
            }}
          />
        </label>
      )}

      {kind && (
        <div className="space-y-2">
          <ChoiceGroup<string>
            name="minutes"
            legend={c.minutesQ}
            value={minutes ? String(minutes) : null}
            onChange={(m) => {
              setMinutes(Number(m));
              setCustomMinutes("");
              setEstimate(null);
            }}
            choices={MINUTES.map((m) => ({ value: String(m), label: `${m} min` }))}
          />
          <input
            className={inputClass}
            inputMode="numeric"
            placeholder={c.minutesCustom}
            aria-label={c.minutesCustom}
            value={customMinutes}
            onChange={(e) => {
              setCustomMinutes(e.target.value.replace(/\D/g, "").slice(0, 3));
              setMinutes(null);
              setEstimate(null);
            }}
          />
        </div>
      )}

      {kind && kind !== "other" && (
        <ChoiceGroup<Effort>
          name="effort"
          legend={c.effortQ}
          value={effort}
          onChange={setEffort}
          choices={(["easy", "sweaty", "exhausting"] as const).map((e) => ({ value: e, label: c.efforts[e][0], desc: c.efforts[e][1] }))}
        />
      )}

      {quickKcal != null && <p className="font-semibold">≈ {fmt(quickKcal)} {t.common.kcal}</p>}
      {estimate && <p className="font-semibold">{c.estimated(estimate.label, estimate.kcal)}</p>}
      {notice && <Notice tone="warn">{notice}</Notice>}
      {pending && <LongWait key={attemptKey} steps={t.wait.workout} expectedSec={5} />}
      {timedOut && !pending && <WaitFailed onRetry={runEstimate} />}

      <div className="flex flex-wrap gap-2">
        {kind === "other" && !estimate ? (
          <Button className="flex-1 whitespace-nowrap" loading={pending} disabled={text.trim().length < 2} onClick={runEstimate}>
            {pending ? c.estimating : c.estimate}
          </Button>
        ) : (
          <Button
            className="flex-1"
            disabled={!(quickKcal != null || estimate)}
            onClick={() =>
              kind === "other" && estimate
                ? onAdd({ kind, minutes: estimate.minutes, effort: null, description: estimate.label, kcal: estimate.kcal })
                : onAdd({ kind: kind!, minutes: mins!, effort: effort!, description: null, kcal: quickKcal! })
            }
          >
            {c.add}
          </Button>
        )}
        <Button variant="quiet" onClick={onCancel}>
          {c.cancel}
        </Button>
      </div>
    </div>
  );
}
