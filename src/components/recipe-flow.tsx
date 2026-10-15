"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { estimateRecipeAction, saveRecipe, type RecipeResponse } from "@/app/actions";
import type { RecipeEstimate } from "@/lib/ai/recipe";
import { useDictation } from "@/lib/client/dictation";
import { useLang, useT } from "@/lib/i18n/client";
import { LongWait, WaitFailed, withTimeout } from "./long-wait";
import { Button, Field, Notice, Panel, dec, fmt, inputClass } from "./ui";

const MIN_PORTIONS = 1;
const MAX_PORTIONS = 12;

function PortionPicker({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const step = (d: number) => onChange(Math.min(MAX_PORTIONS, Math.max(MIN_PORTIONS, value + d)));
  const btn = "flex size-12 items-center justify-center rounded-xl border-2 border-outline bg-enamel text-2xl font-semibold active:scale-95 disabled:border-grout disabled:text-ink-soft";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-semibold">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} onClick={() => step(-1)} disabled={value <= MIN_PORTIONS} aria-label="−1">
          −
        </button>
        <output aria-live="polite" className="board w-10 text-center text-3xl">
          {value}
        </output>
        <button type="button" className={btn} onClick={() => step(1)} disabled={value >= MAX_PORTIONS} aria-label="+1">
          +
        </button>
      </div>
    </div>
  );
}

function MicIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0zM5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

export function RecipeFlow({ showProtein, initial }: { showProtein: boolean; initial?: RecipeEstimate }) {
  const t = useT();
  const r = t.recipe;
  const lang = useLang();
  const [text, setText] = useState("");
  const [portions, setPortions] = useState(4);
  const [result, setResult] = useState<RecipeEstimate | null>(initial ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [estimating, startEstimate] = useTransition();
  const attempt = useRef(0);
  const [attemptKey, setAttemptKey] = useState(0);
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const mic = useDictation({ lang, value: text, onChange: setText });
  const [saveName, setSaveName] = useState(initial?.name ?? "");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saving, startSave] = useTransition();

  const save = () => {
    if (!result) return;
    startSave(async () => {
      setSaveError(false);
      const res = await withTimeout(
        saveRecipe({
          name: saveName.trim() || result.name,
          description: text.trim() || result.name,
          portions,
          items: result.items,
          cooked_weight_g: result.cooked_weight_g,
          assumptions: result.assumptions,
        }),
      );
      if (res !== "timeout" && res.ok) setSaved(true);
      else setSaveError(true);
    });
  };

  const errorText = (e: Extract<RecipeResponse, { ok: false }>["error"]) =>
    e === "ai_paused" ? r.paused : e === "not_configured" ? r.notConfigured : e === "invalid" ? r.needInput : r.failed;

  const calculate = () => {
    if (mic.listening) mic.stop();
    const id = ++attempt.current;
    setAttemptKey(id);
    setRetry(null);
    startEstimate(async () => {
      setNotice(null);
      const res = await withTimeout(estimateRecipeAction({ text }));
      if (id !== attempt.current) return;
      if (res === "timeout") {
        attempt.current++;
        setRetry(() => calculate);
        return;
      }
      if (!res.ok) return setNotice(errorText(res.error));
      if (res.estimate.items.length === 0) return setNotice(res.estimate.assumptions || r.notFood);
      setResult(res.estimate);
      setSaveName(res.estimate.name);
      setSaved(false);
      setSaveError(false);
    });
  };

  const total = result?.items.reduce((s, i) => s + i.kcal, 0) ?? 0;
  const protein = result?.items.reduce((s, i) => s + i.protein_g, 0) ?? 0;

  return (
    <div className="space-y-4">
      {notice && <Notice tone="warn">{notice}</Notice>}
      {estimating && <LongWait key={attemptKey} steps={t.wait.recipe} expectedSec={9} />}
      {retry && !estimating && <WaitFailed onRetry={retry} />}

      {!result && (
        <Panel className="space-y-5">
          <p className="text-sm text-ink-soft">{r.intro}</p>

          <Field label={r.describeLabel}>
            <textarea
              className={`${inputClass} min-h-40`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={r.placeholder}
              maxLength={3000}
            />
          </Field>

          {mic.supported && (
            <div className="space-y-2">
              <Button
                variant={mic.listening ? "primary" : "ghost"}
                className="flex w-full items-center justify-center gap-2"
                onClick={mic.listening ? mic.stop : mic.start}
                disabled={estimating}
                aria-pressed={mic.listening}
              >
                {mic.listening ? (
                  <span aria-hidden className="size-3 animate-pulse rounded-full bg-current" />
                ) : (
                  <MicIcon />
                )}
                {mic.listening ? r.stop : r.speak}
              </Button>
              {mic.listening && <p role="status" className="text-center text-sm text-ink-soft">{r.listening}</p>}
              {mic.error && <Notice tone="warn">{mic.error === "denied" ? r.micDenied : r.micFailed}</Notice>}
            </div>
          )}

          <PortionPicker value={portions} onChange={setPortions} label={r.portions} />

          <Button className="w-full" loading={estimating} disabled={text.trim().length < 3} onClick={calculate}>
            {estimating ? r.calculating : r.calculate}
          </Button>
        </Panel>
      )}

      {result && (
        <Panel className="space-y-5">
          <div>
            <h2 className="board text-xl">{result.name}</h2>
          </div>

          <div className="rounded-xl bg-tile px-4 py-3 text-center">
            <p className="board text-5xl">
              {fmt(total / portions)} <span className="text-2xl">{t.common.kcal}</span>
            </p>
            <p className="font-semibold">{r.perPortion}</p>
            {result.cooked_weight_g > 0 && <p className="text-sm text-ink-soft">{r.gramsPerPortion(fmt(result.cooked_weight_g / portions))}</p>}
            {showProtein && <p className="mt-1 text-sm text-ink-soft">{r.proteinPerPortion(dec(lang, protein / portions, 0))}</p>}
          </div>

          <PortionPicker value={portions} onChange={setPortions} label={r.portions} />

          <div className="menu-row">
            <span className="font-semibold">{r.wholeDish}</span>
            <span className="leader" aria-hidden />
            <span className="value font-semibold">{fmt(total)} {t.common.kcal}</span>
          </div>

          {result.assumptions && <Notice>{result.assumptions}</Notice>}

          <div>
            <h3 className="mb-2 font-semibold">{r.ingredients}</h3>
            <ul className="space-y-1">
              {result.items.map((i, n) => (
                <li key={`${n}-${i.name}`} className="menu-row text-sm">
                  <span className="min-w-0">
                    {i.name}
                    <span className="text-ink-soft">
                      {" "}· {fmt(i.amount)} {i.unit === "pcs" ? r.pcs : i.unit}
                      {i.confidence === "low" && ` · ${r.lowConfidence}`}
                    </span>
                  </span>
                  <span className="leader" aria-hidden />
                  <span className="value">{fmt(i.kcal)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2 rounded-xl border-2 border-grout p-3">
            {saved ? (
              <div className="space-y-2">
                <p role="status" className="font-semibold text-good">✓ {r.savedNotice}</p>
                <Link href="/recipe?tab=saved" className="font-semibold text-accent underline underline-offset-4">
                  {r.seeSaved}
                </Link>
              </div>
            ) : (
              <>
                <Field label={r.saveName}>
                  <input className={inputClass} value={saveName} onChange={(e) => setSaveName(e.target.value)} maxLength={200} />
                </Field>
                <Button className="w-full" loading={saving} disabled={!saveName.trim()} onClick={save}>
                  {saving ? t.common.saving : r.save}
                </Button>
                {saveError && <p role="alert" className="text-sm text-kompot">{r.saveFailed}</p>}
              </>
            )}
          </div>

          <Button variant="ghost" className="w-full" onClick={() => setResult(null)}>
            {r.edit}
          </Button>
          <Button
            variant="quiet"
            className="w-full"
            onClick={() => {
              setResult(null);
              setText("");
              setNotice(null);
            }}
          >
            {r.startOver}
          </Button>
        </Panel>
      )}
    </div>
  );
}
