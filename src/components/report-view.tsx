import type { DailyAi, WeeklyAi } from "@/lib/reports/ai";
import type { DailyData, WeeklyData } from "@/lib/reports/build";
import { getDict } from "@/lib/i18n";
import { isoWeekday } from "@/lib/profile";

type Lang = "en" | "pl";
const loc = (lang: Lang) => (lang === "en" ? "en-GB" : "pl-PL");
const n0 = (lang: Lang, n: number) => new Intl.NumberFormat(loc(lang)).format(Math.round(n));
const n1 = (lang: Lang, n: number) => new Intl.NumberFormat(loc(lang), { maximumFractionDigits: 1 }).format(n);
const signed = (lang: Lang, n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${n1(lang, Math.abs(n))}`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-semibold tracking-wide text-ink-soft uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Bar({ pct, tone }: { pct: number; tone: "good" | "bad" | "water" | "soft" }) {
  const color = { good: "bg-good", bad: "bg-kompot", water: "bg-water", soft: "bg-ink-soft" }[tone];
  return (
    <div className="h-2 overflow-hidden rounded-full bg-grout">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
    </div>
  );
}

function Marks({ items, mark, tone }: { items: string[]; mark: string; tone: string }) {
  return (
    <ul className="space-y-1">
      {items.map((s, i) => (
        <li key={i} className="flex gap-2">
          <span aria-hidden className={`w-3 shrink-0 font-bold ${tone}`}>
            {mark}
          </span>
          <span>{s}</span>
        </li>
      ))}
    </ul>
  );
}

export function DailyReportView({ lang, data, ai }: { lang: Lang; data: DailyData; ai: DailyAi | null }) {
  const t = getDict(lang).reports;
  const kcal = getDict(lang).common.kcal;
  return (
    <div className="space-y-4">
      {data.target != null && <Bar pct={(data.eaten / data.target) * 100} tone={data.diff! > 0 ? "bad" : "good"} />}
      <Section title={t.meals}>
        <ul className="space-y-2">
          {data.meals.map((m, i) => (
            <li key={i} className="menu-row">
              <span className="w-11 shrink-0 text-sm text-ink-soft tabular-nums">{m.time}</span>
              <span className="min-w-0 break-words">
                <span className="font-medium">{m.description}</span>
                {m.items.length > 0 && (
                  <span className="block text-sm text-ink-soft">
                    {m.items.map((it) => `${it.name}${it.amount != null ? ` ${n1(lang, it.amount)}${it.unit === "pcs" ? (lang === "pl" ? " szt." : " pcs") : it.unit ? ` ${it.unit}` : ""}` : ""}`).join(" · ")}
                  </span>
                )}
              </span>
              <span className="leader" aria-hidden />
              <span className="value font-semibold">
                {n0(lang, m.kcal)} {kcal}
              </span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title={t.water}>
        <p className="font-semibold text-water">
          {data.waterTargetMl ? t.waterOf(n0(lang, data.waterMl), n0(lang, data.waterTargetMl)) : t.waterMl(n0(lang, data.waterMl))}
        </p>
        {data.waterTargetMl ? <Bar pct={(data.waterMl / data.waterTargetMl) * 100} tone="water" /> : null}
      </Section>
      {ai ? (
        <>
          {ai.good.length > 0 && (
            <Section title={t.good}>
              <Marks items={ai.good} mark="+" tone="text-good" />
            </Section>
          )}
          {ai.bad.length > 0 && (
            <Section title={t.bad}>
              <Marks items={ai.bad} mark="−" tone="text-kompot" />
            </Section>
          )}
          {ai.tip && (
            <Section title={t.tip}>
              <p className="rounded-lg border-l-4 border-accent bg-tile px-3 py-2">{ai.tip}</p>
            </Section>
          )}
        </>
      ) : (
        <p className="text-sm text-ink-soft">{t.aiMissing}</p>
      )}
    </div>
  );
}

export function WeeklyReportView({ lang, data, ai }: { lang: Lang; data: WeeklyData; ai: WeeklyAi | null }) {
  const t = getDict(lang).reports;
  const max = Math.max(1, ...data.days.map((d) => Math.max(d.eaten, d.target ?? 0)));
  const stat = (text: string, good: boolean | null) => (
    <li className="flex gap-2">
      <span aria-hidden className={`w-3 shrink-0 font-bold ${good == null ? "text-ink-soft" : good ? "text-good" : "text-kompot"}`}>
        {good == null ? "•" : good ? "✓" : "▲"}
      </span>
      <span>{text}</span>
    </li>
  );
  return (
    <div className="space-y-4">
      <ul className="space-y-1">
        {stat(t.daysOnTarget(data.daysOnTarget, data.daysWithTarget), data.daysWithTarget ? data.daysOnTarget >= data.daysWithTarget * 0.7 : null)}
        {data.daysWithTarget > 0 && stat(data.weekDiff > 0 ? t.weekOver(n0(lang, data.weekDiff)) : t.weekUnder(n0(lang, -data.weekDiff)), data.weekDiff <= 0)}
        {stat(t.daysLogged(data.daysLogged), data.daysLogged >= 6)}
        {data.water.targetMl ? stat(t.waterDays(data.water.daysHit), data.water.daysHit >= 5) : null}
        {data.sleep.nights > 0 && stat(`${t.sleep}: ${t.avgSleep(n1(lang, data.sleep.avgHours!), data.sleep.shortNights)}`, data.sleep.shortNights <= 1)}
      </ul>
      <Section title={t.calories}>
        <ul className="space-y-1.5">
          {data.days.map((d) => {
            const over = d.target != null && d.eaten > d.target;
            return (
              <li key={d.date} className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-2 text-sm">
                <span className="text-ink-soft">{t.days[isoWeekday(d.date) - 1]}</span>
                {d.logged ? <Bar pct={(d.eaten / max) * 100} tone={d.target == null ? "soft" : over ? "bad" : "good"} /> : <span className="text-ink-soft">—</span>}
                <span className="tabular-nums">
                  <b>{d.logged ? n0(lang, d.eaten) : ""}</b>
                  <span className="text-ink-soft">{d.target != null ? ` / ${n0(lang, d.target)}` : ""}</span>{" "}
                  <span className={over ? "text-kompot" : "text-good"}>{!d.logged || d.target == null ? "" : over ? "▲" : "✓"}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </Section>
      {ai ? (
        <>
          <Section title={t.progress}>
            <p>{ai.summary}</p>
          </Section>
          <Section title={t.dietFit}>
            <p>{ai.diet_fit}</p>
          </Section>
          {ai.sleep && (
            <Section title={t.sleep}>
              <p>{ai.sleep}</p>
            </Section>
          )}
          {ai.suggestions.length > 0 && (
            <Section title={t.suggestions}>
              <ol className="space-y-2">
                {ai.suggestions.map((s, i) => (
                  <li key={i}>
                    <p className="font-semibold">
                      {i + 1}. {s.what}
                    </p>
                    <p className="text-sm text-ink-soft">
                      <b className="text-accent">{t.how}:</b> {s.how}
                    </p>
                  </li>
                ))}
              </ol>
            </Section>
          )}
        </>
      ) : (
        <p className="text-sm text-ink-soft">{t.aiMissing}</p>
      )}
    </div>
  );
}

export { signed as signedKg };
