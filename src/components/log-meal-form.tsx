"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { logMeal } from "@/app/actions";
import { useT } from "@/lib/i18n/client";
import { Button, ChoiceGroup, Field, Notice, Panel, inputClass } from "./ui";

type When = "now" | "m30" | "h1" | "h2" | "h3" | "custom";

export function LogMealForm({ today, showProtein }: { today: string; showProtein: boolean }) {
  const t = useT();
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [when, setWhen] = useState<When>("now");
  const [customDate, setCustomDate] = useState(today);
  const [customTime, setCustomTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const valid = description.trim() && kcal !== "" && Number(kcal) >= 0 && (when !== "custom" || customTime);

  return (
    <main className="space-y-4 pt-2">
      <h1 className="board text-3xl">{t.log.title}</h1>
      <Notice>{t.log.phase1Note}</Notice>
      <Panel
        as="form"
        className="space-y-5"
      >
        <Field label={t.log.whatQ}>
          <textarea
            className={`${inputClass} min-h-24`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t.log.whatPlaceholder}
            maxLength={2000}
            required
          />
        </Field>
        <div className={`grid gap-3 ${showProtein ? "grid-cols-2" : "grid-cols-1"}`}>
          <Field label={`${t.log.kcal} (${t.common.kcal})`}>
            <input className={inputClass} inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value.replace(/\D/g, ""))} required />
          </Field>
          {showProtein && (
            <Field label={t.log.protein}>
              <input className={inputClass} inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder={t.log.optional} />
            </Field>
          )}
        </div>
        <ChoiceGroup<When>
          name="when"
          legend={t.log.whenQ}
          columns={3}
          value={when}
          onChange={setWhen}
          choices={(["now", "m30", "h1", "h2", "h3", "custom"] as const).map((w) => ({ value: w, label: t.log.when[w] }))}
        />
        {when === "custom" && (
          <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
            <input type="date" className={inputClass} value={customDate} max={today} onChange={(e) => setCustomDate(e.target.value)} aria-label={t.log.when.custom} />
            <input type="time" className={inputClass} value={customTime} onChange={(e) => setCustomTime(e.target.value)} aria-label={t.log.when.custom} required />
          </div>
        )}
        {error && <p className="text-sm text-kompot">{error}</p>}
        <Button
          type="button"
          className="w-full"
          disabled={!valid || pending}
          onClick={() =>
            start(async () => {
              const r = await logMeal({
                description,
                total_kcal: Number(kcal),
                protein_g: protein.replace(",", "."),
                when,
                custom_date: when === "custom" ? customDate : undefined,
                custom_time: when === "custom" ? customTime : undefined,
              });
              if (r.ok) router.push("/");
              else setError(t.common.errorGeneric);
            })
          }
        >
          {pending ? t.common.saving : t.log.save}
        </Button>
      </Panel>
    </main>
  );
}
