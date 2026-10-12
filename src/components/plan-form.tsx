"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { saveProfile, type ProfileInput } from "@/app/actions";
import { ENGINE } from "@/lib/engine/constants";
import { ageOn, localDate } from "@/lib/engine/dates";
import { computeTarget, waterTargetMl } from "@/lib/engine/target";
import type { BodyProfile, FoodFocus, Lifestyle, Method, Sex } from "@/lib/engine/types";
import { I18nProvider, useLang, useT } from "@/lib/i18n/client";
import { hhmm, IF_PRESETS, type Profile } from "@/lib/profile";
import { BirthDateInput } from "./birth-date-input";
import { Button, ChoiceGroup, Field, Notice, Panel, PanelTitle, dec, fmt, inputClass } from "./ui";

type Lang = "en" | "pl";

interface State {
  language: Lang;
  sex: Sex | null;
  date_of_birth: string;
  height_cm: string;
  weight_kg: string;
  lifestyle: Lifestyle | null;
  pace: "auto" | string; // fraction as string, e.g. "0.0075"
  method: Method;
  if_preset: string;
  window_start: string;
  window_end: string;
  low_days: number[];
  food_focus: FoodFocus;
  wake_time: string;
  last_meal_time: string;
  weigh_in_dow: number;
  weigh_in_time: string;
  water_override_ml: string;
}

function initialState(p: Profile, weightKg: number | null): State {
  const cfg = p.method_config ?? {};
  return {
    language: p.language,
    sex: p.sex,
    date_of_birth: p.date_of_birth ?? "",
    height_cm: p.height_cm ? String(p.height_cm) : "",
    weight_kg: weightKg ? String(weightKg) : "",
    lifestyle: p.lifestyle,
    pace: p.pace == null ? "auto" : String(Number(p.pace)),
    method: p.method,
    if_preset: cfg.preset ?? "16:8",
    window_start: cfg.start ?? "12:00",
    window_end: cfg.end ?? "20:00",
    low_days: cfg.low_days ?? [1, 4],
    food_focus: p.food_focus,
    wake_time: hhmm(p.wake_time),
    last_meal_time: hhmm(p.last_meal_time),
    weigh_in_dow: p.weigh_in_dow,
    weigh_in_time: hhmm(p.weigh_in_time),
    water_override_ml: p.water_override_ml ? String(p.water_override_ml) : "",
  };
}

const num = (s: string) => Number(s.replace(",", "."));

/** Body profile for previews, or null while required answers are missing. */
function bodyOf(s: State, pace: BodyProfile["pace"]): BodyProfile | null {
  const today = localDate(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);
  if (!s.sex || !s.lifestyle || !s.date_of_birth || !num(s.height_cm) || !num(s.weight_kg)) return null;
  return { sex: s.sex, ageYears: ageOn(s.date_of_birth, today), heightCm: num(s.height_cm), weightKg: num(s.weight_kg), lifestyle: s.lifestyle, pace };
}

function preview(s: State, pace: BodyProfile["pace"]) {
  const body = bodyOf(s, pace);
  if (!body) return null;
  return computeTarget({ today: "2000-01-01", profile: body, day: { sleepHours: 8, plannedActivity: "rest" } });
}

export function PlanForm(props: { mode: "onboarding" | "settings"; profile: Profile; weightKg: number | null }) {
  const [lang, setLang] = useState<Lang>(props.profile.language);
  return (
    <I18nProvider lang={lang}>
      <PlanFormInner {...props} onLang={setLang} />
    </I18nProvider>
  );
}

function PlanFormInner({ mode, profile, weightKg, onLang }: { mode: "onboarding" | "settings"; profile: Profile; weightKg: number | null; onLang: (l: Lang) => void }) {
  const t = useT();
  const router = useRouter();
  const [s, setS] = useState<State>(() => initialState(profile, weightKg));
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof State>(k: K, v: State[K]) => {
    setS((cur) => ({ ...cur, [k]: v }));
    if (k === "language") onLang(v as Lang);
  };

  const target = useMemo(() => preview(s, s.pace === "auto" ? "auto" : num(s.pace)), [s]);
  const suggestedWater = num(s.weight_kg) ? waterTargetMl(num(s.weight_kg), null, 0) : null;

  const sections = [
    { key: "about", title: t.onboarding.aboutYou, valid: !!bodyOf(s, "auto"), body: <AboutYou s={s} set={set} showWeight={mode === "onboarding"} /> },
    { key: "pace", title: t.onboarding.paceTitle, valid: true, body: <PaceSection s={s} set={set} /> },
    { key: "diet", title: t.onboarding.dietTitle, valid: s.method !== "five_two" || s.low_days.length === 2, body: <DietSection s={s} set={set} /> },
    { key: "routine", title: t.onboarding.routineTitle, valid: true, body: <RoutineSection s={s} set={set} /> },
    { key: "water", title: t.onboarding.waterTitle, valid: true, body: <WaterSection s={s} set={set} suggested={suggestedWater} /> },
  ];

  const submit = () =>
    start(async () => {
      setError(null);
      const input: ProfileInput = {
        ...s,
        sex: s.sex ?? undefined,
        lifestyle: s.lifestyle ?? undefined,
        height_cm: num(s.height_cm),
        weight_kg: mode === "onboarding" ? num(s.weight_kg) : undefined,
        pace: s.pace,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      } as ProfileInput;
      const r = await saveProfile(input, mode);
      if (!r.ok) setError(t.common.errorGeneric);
      else if (mode === "onboarding") router.push("/");
      else {
        setSavedAt(Date.now());
        router.refresh();
      }
    });

  if (mode === "settings") {
    return (
      <div className="space-y-4">
        {sections.map((sec) => (
          <Panel key={sec.key}>
            <PanelTitle>{sec.title}</PanelTitle>
            {sec.body}
          </Panel>
        ))}
        {error && <Notice tone="warn">{error}</Notice>}
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 border-t-2 border-grout bg-tile px-4 py-3">
          <Button className="w-full" disabled={pending || !sections.every((x) => x.valid)} onClick={submit}>
            {pending ? t.common.saving : savedAt ? `${t.settings.saved} ✓` : t.common.save}
          </Button>
        </div>
      </div>
    );
  }

  const isSummary = step === sections.length;
  const current = sections[step];
  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-ink-soft">{t.onboarding.stepOf(step + 1, sections.length + 1)}</p>
      <Panel>
        {isSummary ? (
          <>
            <PanelTitle>{t.onboarding.summaryTitle}</PanelTitle>
            {target && (
              <div className="space-y-2">
                <div className="menu-row">
                  <span>{t.onboarding.summaryTarget}</span>
                  <span className="leader" aria-hidden />
                  <span className="value board text-3xl">{fmt(target.target)} {t.common.kcal}</span>
                </div>
                <div className="menu-row">
                  <span>{t.onboarding.summaryPace}</span>
                  <span className="leader" aria-hidden />
                  <span className="value font-semibold">{t.pace.kgPerWeek(dec(s.language, target.expectedKgPerWeek))}</span>
                </div>
                <div className="menu-row">
                  <span>{t.onboarding.method}</span>
                  <span className="leader" aria-hidden />
                  <span className="value">{t.methods[s.method][0]}</span>
                </div>
                <div className="menu-row">
                  <span>{t.onboarding.focus}</span>
                  <span className="leader" aria-hidden />
                  <span className="value">{t.focuses[s.food_focus][0]}</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <PanelTitle>{current.title}</PanelTitle>
            {current.body}
          </>
        )}
      </Panel>
      {error && <Notice tone="warn">{error}</Notice>}
      <div className="flex gap-2">
        {step > 0 && (
          <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={pending}>
            {t.common.back}
          </Button>
        )}
        {isSummary ? (
          <Button className="flex-1" onClick={submit} disabled={pending}>
            {pending ? t.common.saving : t.onboarding.finish}
          </Button>
        ) : (
          <Button className="flex-1" onClick={() => setStep(step + 1)} disabled={!current.valid}>
            {t.common.next}
          </Button>
        )}
      </div>
    </div>
  );
}

type SectionProps = { s: State; set: <K extends keyof State>(k: K, v: State[K]) => void };

function AboutYou({ s, set, showWeight }: SectionProps & { showWeight: boolean }) {
  const t = useT();
  return (
    <div className="space-y-5">
      <ChoiceGroup<Lang>
        name="language"
        legend={t.onboarding.languageQ}
        columns={2}
        value={s.language}
        onChange={(v) => set("language", v)}
        choices={[{ value: "pl", label: "Polski" }, { value: "en", label: "English" }]}
      />
      <ChoiceGroup<Sex>
        name="sex"
        legend={t.onboarding.sex}
        columns={2}
        value={s.sex}
        onChange={(v) => set("sex", v)}
        choices={[{ value: "male", label: t.onboarding.male }, { value: "female", label: t.onboarding.female }]}
      />
      <BirthDateInput value={s.date_of_birth} onChange={(v) => set("date_of_birth", v)} />
      <div className={`grid gap-3 ${showWeight ? "grid-cols-2" : ""} items-end`}>
        <Field label={t.onboarding.height}>
          <input className={inputClass} inputMode="numeric" value={s.height_cm} onChange={(e) => set("height_cm", e.target.value)} />
        </Field>
        {showWeight && (
          <Field label={t.onboarding.weight}>
            <input className={inputClass} inputMode="decimal" value={s.weight_kg} onChange={(e) => set("weight_kg", e.target.value)} />
          </Field>
        )}
      </div>
      <ChoiceGroup<Lifestyle>
        name="lifestyle"
        legend={t.onboarding.lifestyle}
        value={s.lifestyle}
        onChange={(v) => set("lifestyle", v)}
        choices={(["sedentary", "on_feet", "physical"] as const).map((v) => ({
          value: v,
          label: t.onboarding.lifestyleOpts[v][0],
          desc: t.onboarding.lifestyleOpts[v][1],
        }))}
      />
    </div>
  );
}

function PaceSection({ s, set }: SectionProps) {
  const t = useT();
  const lang = useLang();
  const presets = ENGINE.PACE_PRESETS.map(String);
  const isCustom = s.pace !== "auto" && !presets.includes(s.pace);
  const [custom, setCustom] = useState(isCustom);
  const pct = (f: number) => (f * 100).toLocaleString(lang === "en" ? "en-GB" : "pl-PL", { maximumFractionDigits: 2 });
  const kgLine = (tg: NonNullable<ReturnType<typeof preview>>, paceFrac: number) => {
    const base = t.pace.perWeek(pct(paceFrac), dec(lang, tg.expectedKgPerWeek));
    return tg.warnings.includes("at_floor") ? `${base} (${t.pace.floorCapped(fmt(tg.floor))})` : base;
  };

  const options = [
    { value: "auto", label: t.pace.auto, extra: t.pace.autoDesc },
    ...ENGINE.PACE_PRESETS.map((p, i) => ({ value: String(p), label: [t.pace.easy, t.pace.steady][i] ?? `${pct(p)}%`, extra: "" })),
  ];

  const current = preview(s, s.pace === "auto" ? "auto" : num(s.pace));

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">{t.onboarding.paceHelp}</p>
      <ChoiceGroup<string>
        name="pace"
        value={custom ? null : s.pace}
        onChange={(v) => {
          setCustom(false);
          set("pace", v);
        }}
        choices={options.map((o) => {
          const tg = preview(s, o.value === "auto" ? "auto" : Number(o.value));
          const paceFrac = o.value === "auto" ? tg?.recommendedPace ?? 0 : Number(o.value);
          const line = tg ? kgLine(tg, paceFrac) : `${pct(paceFrac)}%`;
          const warn = tg && tg.warnings.length > 0 ? " ⚠" : "";
          return { value: o.value, label: `${o.label}${warn}`, desc: [o.extra, line].filter(Boolean).join(" · ") };
        })}
      />
      <label className="flex items-center gap-3">
        <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={custom} onChange={(e) => {
          setCustom(e.target.checked);
          if (e.target.checked && s.pace === "auto") set("pace", "0.008");
        }} />
        <span className="font-semibold">{t.pace.custom}</span>
      </label>
      {custom && (
        <div className="space-y-1">
          <input
            type="range"
            className="w-full accent-[var(--accent)]"
            min={0.0025}
            max={ENGINE.MAX_CUSTOM_PACE}
            step={0.0005}
            value={s.pace === "auto" ? 0.008 : num(s.pace)}
            onChange={(e) => set("pace", e.target.value)}
            aria-label={t.pace.custom}
          />
          <p className="text-center font-semibold">
            {current ? kgLine(current, num(s.pace)) : `${pct(num(s.pace))}%`}
          </p>
        </div>
      )}
      {current && current.warnings.length > 0 && (
        <Notice tone="warn">
          <strong>{t.pace.warnTitle}</strong>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {current.warnings.map((w) => (
              <li key={w}>{t.pace.warnings[w]}</li>
            ))}
          </ul>
        </Notice>
      )}
    </div>
  );
}

function DietSection({ s, set }: SectionProps) {
  const t = useT();
  return (
    <div className="space-y-5">
      <ChoiceGroup<Method>
        name="method"
        legend={t.onboarding.method}
        value={s.method}
        onChange={(v) => set("method", v)}
        choices={(["none", "if", "five_two", "montignac"] as const).map((m) => ({ value: m, label: t.methods[m][0], desc: t.methods[m][1] }))}
      />
      {s.method === "if" && (
        <div className="space-y-3 rounded-xl border-2 border-mustard bg-mustard-bg p-3">
          <ChoiceGroup<string>
            name="if_preset"
            legend={t.onboarding.windowTitle}
            columns={2}
            value={s.if_preset}
            onChange={(v) => {
              set("if_preset", v);
              if (IF_PRESETS[v]) {
                set("window_start", IF_PRESETS[v].start);
                set("window_end", IF_PRESETS[v].end);
              }
            }}
            choices={[
              ...Object.entries(IF_PRESETS).map(([k, w]) => ({ value: k, label: k, desc: `${w.start}–${w.end}` })),
              { value: "custom", label: t.pace.custom },
            ]}
          />
          {s.if_preset === "custom" && (
            <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
              <Field label={t.onboarding.windowStart}>
                <input type="time" className={inputClass} value={s.window_start} onChange={(e) => set("window_start", e.target.value)} />
              </Field>
              <Field label={t.onboarding.windowEnd}>
                <input type="time" className={inputClass} value={s.window_end} onChange={(e) => set("window_end", e.target.value)} />
              </Field>
            </div>
          )}
        </div>
      )}
      {s.method === "five_two" && (
        <fieldset className="rounded-xl border-2 border-mustard bg-mustard-bg p-3">
          <legend className="px-1 font-semibold">{t.onboarding.lowDays}</legend>
          <div className="grid grid-cols-4 gap-2">
            {t.weekdays.map((d, i) => {
              const dow = i + 1;
              const on = s.low_days.includes(dow);
              return (
                <label key={d} className={`cursor-pointer rounded-lg border-2 px-2 py-2 text-center text-sm font-semibold ${on ? "border-accent bg-accent text-on-accent" : "border-grout bg-enamel"}`}>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={() => {
                      const next = on ? s.low_days.filter((x) => x !== dow) : [...s.low_days, dow].slice(-2);
                      set("low_days", next);
                    }}
                  />
                  {d.slice(0, 3)}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
      <ChoiceGroup<FoodFocus>
        name="food_focus"
        legend={t.onboarding.focus}
        value={s.food_focus}
        onChange={(v) => set("food_focus", v)}
        choices={(["balanced", "low_carb", "mediterranean", "high_protein", "vegetarian"] as const).map((f) => ({
          value: f,
          label: t.focuses[f][0],
          desc: t.focuses[f][1],
        }))}
      />
    </div>
  );
}

function RoutineSection({ s, set }: SectionProps) {
  const t = useT();
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
        <Field label={t.onboarding.wakeTime}>
          <input type="time" className={inputClass} value={s.wake_time} onChange={(e) => set("wake_time", e.target.value)} />
        </Field>
        {s.method !== "if" && (
          <Field label={t.onboarding.lastMeal}>
            <input type="time" className={inputClass} value={s.last_meal_time} onChange={(e) => set("last_meal_time", e.target.value)} />
          </Field>
        )}
      </div>
      <fieldset className="space-y-2">
        <legend className="font-semibold">{t.onboarding.weighInTitle}</legend>
        <p className="text-sm text-ink-soft">{t.onboarding.weighInHelp}</p>
        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
          <Field label={t.onboarding.weighInDay}>
            <select className={inputClass} value={s.weigh_in_dow} onChange={(e) => set("weigh_in_dow", Number(e.target.value))}>
              {t.weekdays.map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t.onboarding.weighInTime}>
            <input type="time" className={inputClass} value={s.weigh_in_time} onChange={(e) => set("weigh_in_time", e.target.value)} />
          </Field>
        </div>
      </fieldset>
    </div>
  );
}

function WaterSection({ s, set, suggested }: SectionProps & { suggested: number | null }) {
  const t = useT();
  return (
    <div className="space-y-3">
      {suggested && <p>{t.onboarding.waterHelp(suggested)}</p>}
      <Field label={t.onboarding.waterCustom}>
        <input
          className={inputClass}
          inputMode="numeric"
          placeholder={suggested ? String(suggested) : ""}
          value={s.water_override_ml}
          onChange={(e) => set("water_override_ml", e.target.value.replace(/\D/g, ""))}
        />
      </Field>
    </div>
  );
}
