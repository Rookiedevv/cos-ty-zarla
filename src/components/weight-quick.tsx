"use client";

import { useState, useTransition } from "react";
import { saveWeight } from "@/app/actions";
import { useT } from "@/lib/i18n/client";
import { Button, inputClass } from "./ui";

export function WeightQuick({ last }: { last?: { kg: number; date: string } | null }) {
  const t = useT();
  const [kg, setKg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveWeight(Number(kg.replace(",", ".")));
          setError(r.ok ? null : t.common.errorGeneric);
        });
      }}
    >
      <h2 className="board text-xl">{t.weight.title}</h2>
      <label className="block">
        <span className="mb-1 block font-semibold">{t.weight.q}</span>
        <div className="flex gap-2">
          <input
            className={inputClass}
            inputMode="decimal"
            required
            value={kg}
            onChange={(e) => setKg(e.target.value)}
            placeholder={last ? String(last.kg).replace(".", ",") : "85,4"}
            aria-describedby={last ? "last-weight" : undefined}
          />
          <span className="self-center font-semibold">{t.common.kg}</span>
        </div>
      </label>
      {last && (
        <p id="last-weight" className="text-sm text-ink-soft">
          {t.weight.last(String(last.kg), last.date)}
        </p>
      )}
      {error && <p className="text-sm text-kompot">{error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? t.common.saving : t.weight.save}
      </Button>
    </form>
  );
}
