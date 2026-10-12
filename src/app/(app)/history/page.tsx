import { MealList } from "@/components/meal-list";
import { Panel, fmt } from "@/components/ui";
import type { Meal } from "@/lib/day";
import { todayFor } from "@/lib/day";
import { addDays } from "@/lib/engine/dates";
import { getDict } from "@/lib/i18n";
import { requireOnboardedUser } from "@/lib/session";

export default async function HistoryPage() {
  const { supabase, profile } = await requireOnboardedUser();
  const t = getDict(profile.language);
  const today = todayFor(profile);
  const from = addDays(today, -30);

  const [mealsRes, targetsRes] = await Promise.all([
    supabase.from("meals").select("id, eaten_at, eaten_date, description, total_kcal, protein_g, outside_window")
      .gte("eaten_date", from).order("eaten_at", { ascending: true }),
    supabase.from("daily_targets").select("date, final_target").gte("date", from),
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

  return (
      <main className="space-y-4 pt-2">
        <h1 className="board text-3xl">{t.history.title}</h1>
        {dates.length === 0 ? (
          <Panel>
            <p className="text-ink-soft">{t.history.empty}</p>
          </Panel>
        ) : (
          <Panel as="div" className="divide-y-2 divide-dotted divide-grout p-0">
            {dates.map((d) => {
              const dayMeals = byDate.get(d) ?? [];
              const eaten = dayMeals.reduce((s, m) => s + m.total_kcal, 0);
              const target = targets.get(d);
              const over = target != null && eaten > target;
              return (
                <details key={d} className="px-4 py-3">
                  <summary className="cursor-pointer list-none">
                    <div className="menu-row">
                      <span className="font-semibold first-letter:uppercase">{label(d)}</span>
                      <span className="leader" aria-hidden />
                      <span className={`value ${over ? "font-semibold text-kompot" : ""}`}>
                        {target != null ? t.history.ofTarget(eaten, target) : `${fmt(eaten)} ${t.common.kcal}`}
                      </span>
                    </div>
                  </summary>
                  <div className="mt-3">
                    <MealList meals={dayMeals} timezone={profile.timezone} />
                  </div>
                </details>
              );
            })}
          </Panel>
        )}
      </main>
  );
}
