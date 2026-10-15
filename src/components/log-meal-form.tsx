"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { logMeal } from "@/app/actions";
import { useT } from "@/lib/i18n/client";
import { withTimeout } from "./long-wait";
import { Button, Field, Panel, inputClass } from "./ui";
import { WhenPicker, whenPayload, whenReady, type WhenValue } from "./when-picker";

/** Manual entry: a description and the calories, typed in by hand. */
export function LogMealForm({ today, showProtein, initialDescription = "" }: { today: string; showProtein: boolean; initialDescription?: string }) {
  const t = useT();
  const router = useRouter();
  const [description, setDescription] = useState(initialDescription);
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [when, setWhen] = useState<WhenValue>({ when: "now", customDate: today, customTime: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const valid = description.trim() && kcal !== "" && Number(kcal) >= 0 && whenReady(when);

  return (
    <Panel className="space-y-5">
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
      <WhenPicker value={when} onChange={setWhen} today={today} />
      {error && <p className="text-sm text-kompot">{error}</p>}
      <Button
        type="button"
        className="w-full"
        loading={pending}
        disabled={!valid}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await withTimeout(logMeal({ description, total_kcal: Number(kcal), protein_g: protein.replace(",", "."), source: "manual", ...whenPayload(when) }));
            if (r !== "timeout" && r.ok) router.push("/");
            else setError(t.wait.saveFailed);
          })
        }
      >
        {pending ? t.common.saving : t.log.save}
      </Button>
    </Panel>
  );
}
