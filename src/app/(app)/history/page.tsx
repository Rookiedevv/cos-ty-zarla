import Link from "next/link";
import { MealList } from "@/components/meal-list";
import { Panel, fmt } from "@/components/ui";
import { WeightHistory } from "@/components/weight-history";
import type { WeightPoint } from "@/components/weight-chart";
import type { Meal } from "@/lib/day";
import { MEAL_COLUMNS, todayFor } from "@/lib/day";
import { addDays } from "@/lib/engine/dates";
import { getDict } from "@/lib/i18n";
import { requireOnboardedUser } from "@/lib/session";

type Tab = "meals" | "weight";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { supabase, profile } = await requireOnboardedUser();
  const tab: Tab = (await searchParams).tab === "weight" ? "weight" : "meals";
  const t = getDict(profile.language);

  return (
    <main className="space-y-4 pt-2">
      <h1 className="board text-3xl">{t.history.title}</h1>
      <nav aria-label={t.history.title} className="grid grid-cols-2 gap-1 rounded-2xl bg-grout p-1">
        {(["meals", "weight"] as const).map((key) => (
          <Link
            key={key}
            href={`/history?tab=${key}`}
            aria-current={tab === key ? "page" : undefined}
            className={`flex min-h-11 items-center justify-center rounded-xl px-2 font-semibold ${
              tab === key ? "bg-enamel text-ink shadow-[var(--panel-shadow)]" : "text-ink-soft hover:text-ink"
            }`}
          >
            {key === "meals" ? t.history.tabMeals : t.history.tabWeight}
          </Link>
        ))}
      </nav>
      {tab === "meals" ? <MealsTab supabase={supabase} profile={profile} /> : <WeightTab supabase={supabase} profile={profile} />}
    </main>
  );
}

type Ctx = Awaited<ReturnType<typeof requireOnboardedUser>>;

async function WeightTab({ supabase, profile }: Ctx) {
  const { data } = await supabase.from("weights").select("date, kg").eq("user_id", profile.id).order("date", { ascending: true });
  const points: WeightPoint[] = (data ?? []).map((r) => ({ date: r.date as string, kg: Number(r.kg) }));
  return <WeightHistory points={points} />;
}

/** Last 30 days: calories vs target per day, meals hidden until you open the day. */
async function MealsTab({ supabase, profile }: Ctx) {
  const t = getDict(profile.language);
  const today = todayFor(profile);
  const from = addDays(today, -30);

  const [mealsRes, targetsRes] = await Promise.all([
    supabase.from("meals").select(MEAL_COLUMNS)
      .eq("user_id", profile.id).gte("eaten_date", from).order("eaten_at", { ascending: true }),
    supabase.from("daily_targets").select("date, final_target").eq("user_id", profile.id).gte("date", from),
  ]);

  const meals = (mealsRes.data ?? []) as Meal[];
  const targets = new Map((targetsRes.data ?? []).map((r) => [r.date as string, r.final_target as number]));
  const byDate = new Map<string, Meal[]>();
  for (const m of meals) byDate.set(m.eaten_date, [...(byDate.get(m.eaten_date) ?? []), m]);
  const dates = [...new Set([...byDate.keys(), ...targets.keys()])].sort().reverse();

  const locale = profile.language === "en" ? "en-GB" : "pl-PL";
  const label = (d: string) =>
    d === today
      ? t.common.today
      : d === addDays(today, -1)
        ? t.common.yesterday
        : new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

  if (dates.length === 0) {
    return (
      <Panel>
        <p className="text-ink-soft">{t.history.empty}</p>
      </Panel>
    );
  }

  return (
    <Panel as="div" className="divide-y divide-grout p-0">
      {dates.map((d) => {
        const dayMeals = byDate.get(d) ?? [];
        const eaten = dayMeals.reduce((s, m) => s + m.total_kcal, 0);
        const target = targets.get(d);
        const diff = target != null ? eaten - target : null;
        const over = diff != null && diff > 0;
        return (
          <details key={d} className="group px-4 py-3">
            <summary className="flex cursor-pointer list-none items-center gap-3">
              {/* Status dot: green within target, red over. Always paired with the signed number and words. */}
              <span
                aria-hidden
                className={`size-3 shrink-0 rounded-full ${diff == null ? "bg-grout" : over ? "bg-kompot" : "bg-good"}`}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold first-letter:uppercase">{label(d)}</span>
                <span className="block text-sm text-ink-soft">
                  {diff == null ? t.history.noTarget : over ? t.history.over(`+${fmt(diff)} ${t.common.kcal}`) : t.history.under(`${fmt(-diff)} ${t.common.kcal}`)}
                </span>
              </span>
              <span className="shrink-0 text-right tabular-nums">
                <span className="board block text-xl">{fmt(eaten)}</span>
                <span className="block text-xs text-ink-soft">{target != null ? `/ ${fmt(target)} ${t.common.kcal}` : t.common.kcal}</span>
              </span>
              <svg aria-hidden viewBox="0 0 24 24" className="size-5 shrink-0 text-ink-soft transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </summary>
            <div className="mt-3 border-t border-grout pt-3">
              {dayMeals.length ? <MealList meals={dayMeals} timezone={profile.timezone} /> : <p className="text-sm text-ink-soft">{t.history.noMeals}</p>}
            </div>
          </details>
        );
      })}
    </Panel>
  );
}
