import Link from "next/link";
import { Notice, Panel, PanelTitle, dec, fmt } from "@/components/ui";
import { MealList } from "@/components/meal-list";
import { WaterPanel } from "@/components/water-panel";
import { WorkoutList } from "@/components/workout-list";
import { DietReminderCard } from "@/components/diet-reminder-card";
import type { FoodFocus, Method } from "@/lib/engine/types";
import { WeightQuick } from "@/components/weight-quick";
import type { DayState } from "@/lib/day";
import { getDict, type Lang } from "@/lib/i18n";

/** The Today screen, separated from data loading so it can be rendered with any DayState. */
export function TodayView({ day, lang, timezone, diet }: { day: DayState; lang: Lang; timezone: string; diet: { method: Method; focus: FoodFocus } }) {
  const t = getDict(lang);
  const date = day.date;
  const target = day.target;
  const left = target ? target.target - day.eaten : null;
  const over = left != null && left < 0;
  const locale = lang === "en" ? "en-GB" : "pl-PL";
  const heading = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );

  return (
    <main className="space-y-4">
      <header className="flex items-baseline justify-between gap-3 pt-2">
        <h1 className="board text-3xl first-letter:uppercase">{heading}</h1>
        {day.isWeighInDay && <span className="shrink-0 rounded-full border-2 border-water px-2 py-0.5 text-sm font-semibold text-water">{t.today.weighInDue}</span>}
      </header>

      {!day.checkin && (
        <Link
          href="/checkin"
          className="flex min-h-14 items-center justify-between gap-3 rounded-2xl panel-frame bg-mustard-bg px-4 py-3"
        >
          <span>
            <span className="block font-semibold">{t.today.checkinCta}</span>
            <span className="block text-sm text-ink-soft">{t.today.provisional}</span>
          </span>
          <svg aria-hidden viewBox="0 0 24 24" className="size-6 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </Link>
      )}

      <Panel className="space-y-3">
        {target && left != null ? (
          <>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className={`board text-7xl leading-none ${over ? "text-kompot" : ""}`}>{fmt(Math.abs(left))}</p>
                <p className="mt-1 font-semibold">
                  {t.common.kcal} {over ? t.today.over : t.today.left}
                </p>
              </div>
              <dl className="text-right text-sm">
                <div>
                  <dt className="inline text-ink-soft">{t.today.eaten} </dt>
                  <dd className="inline font-semibold tabular-nums">{fmt(day.eaten)}</dd>
                </div>
                <div>
                  <dt className="inline text-ink-soft">{t.today.target} </dt>
                  <dd className="inline font-semibold tabular-nums">{fmt(target.target)}</dd>
                </div>
              </dl>
            </div>
            <Meter value={day.eaten} max={target.target} />
            {day.proteinTargetG && (
              <p className="text-sm">
                {t.today.protein(day.proteinG, day.proteinTargetG)}
              </p>
            )}

            {day.watch && (
              <p className="text-sm text-ink-soft">
                {t.today.watchLine(
                  fmt(day.watch.steps ?? 0),
                  fmt(day.watch.activeKcal ?? 0),
                  t.today.ago(Math.max(0, Math.round((Date.parse(day.nowIso) - Date.parse(day.watch.updatedAt)) / 60000))),
                )}
              </p>
            )}
            <p className="text-sm text-ink-soft">
              {target.maintenance ? t.today.maintenance : t.today.paceLine(dec(lang, target.expectedKgPerWeek))}
            </p>
            {day.isLowDay && <Notice tone="fast">{t.today.lowDay}</Notice>}
            {target.sleepAdjusted && <Notice>{t.today.sleepAdjusted}</Notice>}
            {target.carryOver > 0 && <Notice>{t.today.carry(target.carryOver)}</Notice>}
            {target.warnings.length > 0 && (
              <Notice tone="warn">
                <strong>{t.pace.warnTitle}</strong>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {target.warnings.map((w) => (
                    <li key={w}>{t.pace.warnings[w]}</li>
                  ))}
                </ul>
              </Notice>
            )}

            <details className="text-sm">
              <summary className="cursor-pointer font-semibold">{t.today.howCalculated}</summary>
              <div className="mt-2 space-y-1">
                <Row label={target.mode === "watch" ? t.today.breakdown.baseWatch : t.today.breakdown.base} value={`${fmt(target.baseBurn)}`} />
                <Row
                  label={
                    target.activitySource === "watch"
                      ? t.today.breakdown.activityWatch
                      : target.activitySource === "workouts"
                        ? t.today.breakdown.activityWorkouts
                        : t.today.breakdown.activityNone
                  }
                  value={`+${fmt(target.activityKcal)}`}
                />
                <Row label={t.today.breakdown.deficit} value={`−${fmt(target.deficit)}`} />
                {target.carryOver > 0 && <Row label={t.today.breakdown.carry} value={`−${fmt(target.carryOver)}`} />}
                <Row label={t.today.breakdown.target} value={`${fmt(target.target)}`} strong />
                <Row label={t.today.breakdown.floor} value={`${fmt(target.floor)}`} />
              </div>
            </details>
          </>
        ) : (
          <WeightQuick />
        )}
      </Panel>

      {day.checkin && <DietReminderCard method={diet.method} focus={diet.focus} lang={lang} />}

      {!day.hasWatch && day.checkin && (
        <Panel>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <PanelTitle>{t.today.workouts}</PanelTitle>
            <Link href="/checkin" className="text-sm font-semibold text-accent underline underline-offset-2">
              {t.today.editPlan}
            </Link>
          </div>
          <WorkoutList workouts={day.workouts} restDay={day.checkin.rest_day} />
        </Panel>
      )}

      {day.window && (
        <Notice tone={day.window.open ? "info" : "fast"}>
          {day.window.open ? t.today.windowOpen(day.window.end) : t.today.windowClosed(day.window.start)}
        </Notice>
      )}

      <Panel>
        <PanelTitle>{t.today.meals}</PanelTitle>
        <MealList meals={day.meals} timezone={timezone} />
        <Link
          href="/log"
          className="mt-3 flex min-h-12 items-center justify-center rounded-xl border-2 border-outline font-semibold hover:bg-tile"
        >
          {t.today.logMeal}
        </Link>
      </Panel>

      {day.waterTargetMl && <WaterPanel ml={day.waterMl} target={day.waterTargetMl} />}

      {day.isWeighInDay && day.lastWeight?.date !== date && target && (
        <Panel>
          <WeightQuick last={day.lastWeight} />
        </Panel>
      )}
    </main>
  );
}

function Meter({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const over = value > max;
  return (
    <div className="h-3 overflow-hidden rounded-full border-2 border-outline bg-tile" role="presentation">
      <div className={`h-full ${over ? "bg-kompot" : "bg-accent"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`menu-row ${strong ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span className="leader" aria-hidden />
      <span className="value">{value}</span>
    </div>
  );
}
