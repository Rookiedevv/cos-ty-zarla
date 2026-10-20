"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { estimateMealAction, logMeal, type EstimateResponse } from "@/app/actions";
import type { Estimate } from "@/lib/ai/estimate";
import { preparePhoto, type PreparedPhoto } from "@/lib/client/photo";
import { gramsPerPortion, perPortion, type SavedRecipe } from "@/lib/recipes";
import { useT } from "@/lib/i18n/client";
import { LogMealForm } from "./log-meal-form";
import { LongWait, WaitFailed, withTimeout } from "./long-wait";
import { Button, Field, Notice, Panel, fmt, inputClass } from "./ui";
import { WhenPicker, whenPayload, whenReady, type WhenValue } from "./when-picker";

type Stage = "input" | "questions" | "review" | "manual";

interface DraftItem {
  key: string;
  name: string;
  amount: string;
  unit: "g" | "ml" | "pcs";
  kcal: string;
  protein: string;
  fromBarcode: boolean;
  low: boolean;
}

const toDraft = (e: Estimate): DraftItem[] =>
  e.items.map((i, n) => ({
    key: `${n}-${i.name}`,
    name: i.name,
    amount: String(i.amount),
    unit: i.unit,
    kcal: String(i.kcal),
    protein: String(i.protein_g),
    fromBarcode: i.from_barcode,
    low: i.confidence === "low",
  }));

const num = (s: string) => Number(s.replace(",", ".")) || 0;

export function AiMealFlow({
  today,
  showProtein,
  recipes = [],
  initial,
}: {
  today: string;
  showProtein: boolean;
  /** Saved recipes this person can log from (hidden ones left out). */
  recipes?: SavedRecipe[];
  /** Start at a given step with an existing estimate (used for previews). */
  initial?: { stage: Stage; estimate: Estimate };
}) {
  const t = useT();
  const ai = t.ai;
  const router = useRouter();
  const [stage, setStage] = useState<Stage>(initial?.stage ?? "input");
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"own" | "recipe">("own");
  // One id per meal being logged: retrying a save can never create a second copy. New meal → new id.
  const [mealId, setMealId] = useState(() => crypto.randomUUID());
  // Recipes found to be deleted while this screen was open.
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  const pickable = recipes.filter((r) => !gone.has(r.id));
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const recipe = mode === "recipe" ? (pickable.find((r) => r.id === recipeId) ?? null) : null;
  const refGrams = recipe ? gramsPerPortion(recipe) : null;
  const [round, setRound] = useState(1);
  const [estimate, setEstimate] = useState<Estimate | null>(initial?.estimate ?? null);
  const [answers, setAnswers] = useState<{ question: string; answer: string }[]>([]);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [description, setDescription] = useState(initial?.estimate.description ?? "");
  const [items, setItems] = useState<DraftItem[]>(initial ? toDraft(initial.estimate) : []);
  const [when, setWhen] = useState<WhenValue>({ when: "now", customDate: today, customTime: "" });
  const [notice, setNotice] = useState<{ tone: "info" | "warn"; text: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [pending, start] = useTransition();
  const [estimating, startEstimate] = useTransition();
  // Each estimate attempt gets a number; a late answer from an attempt that timed out is ignored.
  const attempt = useRef(0);
  const [attemptKey, setAttemptKey] = useState(0);
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  // Photo previews are freed when replaced or removed (changePhoto) and when leaving the screen.
  const previewRef = useRef<string | null>(null);
  const changePhoto = (next: PreparedPhoto | null) => {
    if (previewRef.current && previewRef.current !== next?.previewUrl) URL.revokeObjectURL(previewRef.current);
    previewRef.current = next?.previewUrl ?? null;
    setPhoto(next);
  };
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setPreparing(true);
    setNotice(null);
    try {
      changePhoto(await preparePhoto(file));
    } catch {
      setNotice({ tone: "warn", text: ai.failed });
    } finally {
      setPreparing(false);
    }
  };

  const errorText = (r: Extract<EstimateResponse, { ok: false }>) =>
    r.error === "ai_paused"
      ? ai.paused
      : r.error === "busy"
        ? ai.busy
        : r.error === "recipe_gone"
          ? ai.recipeGone
          : r.error === "not_configured"
            ? ai.notConfigured
            : r.error === "invalid"
              ? recipe
                ? ai.needRecipeInput
                : ai.needInput
              : ai.failed;

  const runEstimate = (nextRound: number, allAnswers: { question: string; answer: string }[]) => {
    const id = ++attempt.current;
    setAttemptKey(id);
    setRetry(null);
    startEstimate(async () => {
      setNotice(null);
      const r = await withTimeout(
        estimateMealAction({
          photo: photo ? { data: photo.data, mediaType: photo.mediaType } : undefined,
          text: text.trim() || undefined,
          barcodes: photo?.barcodes ?? [],
          answers: allAnswers,
          round: nextRound,
          recipe_id: recipe?.id,
        }),
      );
      if (id !== attempt.current) return;
      if (r === "timeout") {
        attempt.current++;
        setRetry(() => () => runEstimate(nextRound, allAnswers));
        return;
      }
      if (!r.ok) {
        setNotice({ tone: "warn", text: errorText(r) });
        if (r.error === "ai_paused" || r.error === "not_configured") setStage("manual");
        if (r.error === "recipe_gone") {
          if (recipeId) setGone((g) => new Set(g).add(recipeId));
          setRecipeId(null);
          setStage("input");
          router.refresh();
        }
        return;
      }
      if (r.estimate.items.length === 0) {
        setNotice({ tone: "warn", text: r.estimate.description || ai.notFood });
        setStage("input");
        return;
      }
      setEstimate(r.estimate);
      setRound(nextRound);
      setAnswers(allAnswers);
      setDescription(r.estimate.description);
      setItems(toDraft(r.estimate));
      setPick({});
      setStage(r.estimate.questions.length ? "questions" : "review");
    });
  };

  const submitAnswers = () => {
    if (!estimate) return;
    const fresh = estimate.questions
      .filter((q) => pick[q.id]?.trim())
      .map((q) => ({ question: q.text, answer: pick[q.id].trim() }));
    if (!fresh.length) return setStage("review");
    runEstimate(round + 1, [...answers, ...fresh]);
  };

  const total = items.reduce((s, i) => s + Math.round(num(i.kcal)), 0);
  const canSave = description.trim() && items.length > 0 && items.every((i) => i.name.trim() && i.kcal !== "") && whenReady(when);

  const save = () =>
    start(async () => {
      setNotice(null);
      const r = await withTimeout(logMeal({
        id: mealId,
        description: description.trim(),
        items: items.map((i) => ({
          name: i.name.trim(),
          amount: i.amount ? num(i.amount) : null,
          unit: i.unit,
          kcal: Math.round(num(i.kcal)),
          protein_g: i.protein ? num(i.protein) : null,
          barcode: null,
          source: i.fromBarcode ? "barcode" : "ai",
        })),
        source: photo ? "ai_photo" : "ai_text",
        verdict: estimate?.verdict,
        ai_draft: estimate ?? undefined,
        photo: photo ? { data: photo.data, mediaType: photo.mediaType } : undefined,
        recipe_id: recipe?.id,
        ...whenPayload(when),
      }));
      if (r !== "timeout" && r.ok) router.push("/");
      else setNotice({ tone: "warn", text: t.wait.saveFailed });
    });

  const reset = () => {
    attempt.current++; // ignore any answer still on its way
    setStage("input");
    changePhoto(null);
    setText("");
    setEstimate(null);
    setAnswers([]);
    setPick({});
    setItems([]);
    setDescription("");
    setRound(1);
    setNotice(null);
    setRetry(null);
    setMode("own");
    setRecipeId(null);
    setMealId(crypto.randomUUID());
    setWhen({ when: "now", customDate: today, customTime: "" });
  };

  const update = (key: string, patch: Partial<DraftItem>) => setItems((cur) => cur.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  return (
    <main className="space-y-4 pt-2">
      <h1 className="board text-3xl">{ai.title}</h1>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      {estimating && <LongWait key={attemptKey} steps={photo ? t.wait.mealPhoto : t.wait.mealText} expectedSec={photo ? 10 : 7} />}
      {retry && !estimating && <WaitFailed onRetry={retry} />}

      {stage === "input" && (
        <Panel className="space-y-5">
          <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-2xl bg-grout p-1">
            {(["own", "recipe"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => {
                  setMode(m);
                  setNotice(null);
                }}
                className={`min-h-11 rounded-xl px-2 font-semibold ${mode === m ? "bg-enamel text-ink shadow-[var(--panel-shadow)]" : "text-ink-soft hover:text-ink"}`}
              >
                {m === "own" ? ai.modeOwn : ai.modeRecipe}
              </button>
            ))}
          </div>

          {mode === "recipe" && !pickable.length && <p className="text-ink-soft">{ai.noRecipes}</p>}

          {mode === "recipe" && pickable.length > 0 && !recipe && (
            <fieldset>
              <legend className="mb-2 font-semibold">{ai.pickRecipe}</legend>
              <ul className="space-y-2">
                {pickable.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setRecipeId(r.id)}
                      className="menu-row w-full rounded-xl border-2 border-grout bg-enamel px-3 py-2 text-left hover:border-outline"
                    >
                      <span className="min-w-0 font-semibold">{r.name}</span>
                      <span className="leader" aria-hidden />
                      <span className="value whitespace-nowrap text-sm">
                        {fmt(perPortion(r))} {t.common.kcal}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}

          {recipe && (
            <div className="space-y-1 rounded-xl bg-tile px-3 py-2">
              <p className="font-semibold">{recipe.name}</p>
              <p className="text-sm text-ink-soft">{ai.recipeRef(fmt(perPortion(recipe)), refGrams ? fmt(refGrams) : null)}</p>
              <button type="button" className="min-h-11 text-sm font-semibold text-accent underline underline-offset-4" onClick={() => setRecipeId(null)}>
                {ai.changeRecipe}
              </button>
            </div>
          )}

          {(mode === "own" || recipe) && (
          <>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = ""; // so picking the same picture again still fires
            }} />
          <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = ""; // so picking the same picture again still fires
            }} />

          {photo ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview of an unsent photo */}
              <img src={photo.previewUrl} alt="" className="max-h-72 w-full rounded-xl object-cover" />
              {photo.barcodes.map((b) => (
                <p key={b} className="text-sm font-semibold text-accent">{ai.barcodeFound(b)}</p>
              ))}
              <Button variant="quiet" onClick={() => changePhoto(null)}>{ai.removePhoto}</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-[2fr_1fr]">
              <Button onClick={() => cameraRef.current?.click()} disabled={preparing} className="flex min-h-16 items-center justify-center gap-2 text-lg">
                <svg aria-hidden viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                  <circle cx="12" cy="13" r="3.5" />
                </svg>
                {ai.takePhoto}
              </Button>
              <Button variant="ghost" onClick={() => galleryRef.current?.click()} disabled={preparing} className="min-h-16 whitespace-nowrap">
                {ai.fromGallery}
              </Button>
            </div>
          )}

          <Field label={recipe ? ai.recipeAmountLabel : ai.describeLabel} hint={photo && !recipe ? ai.describeOptional : undefined}>
            <textarea
              className={`${inputClass} min-h-24`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={recipe ? ai.recipeAmountPlaceholder : ai.describePlaceholder}
              maxLength={1500}
            />
          </Field>

          <Button className="w-full" loading={estimating} disabled={preparing || (!photo && !text.trim())} onClick={() => runEstimate(1, [])}>
            {estimating ? ai.estimating : ai.estimate}
          </Button>
          </>
          )}
          <Button variant="quiet" className="w-full" onClick={() => setStage("manual")}>
            {ai.manual}
          </Button>
        </Panel>
      )}

      {stage === "questions" && estimate && (
        <Panel className="space-y-5">
          <div>
            <h2 className="board text-xl">{ai.questionsTitle}</h2>
            <p className="text-sm text-ink-soft">{ai.questionsHelp}</p>
          </div>
          <div className="menu-row rounded-xl bg-tile px-3 py-2">
            <span className="min-w-0 truncate">{estimate.description}</span>
            <span className="leader" aria-hidden />
            <span className="value font-semibold">~{fmt(estimate.items.reduce((s, i) => s + i.kcal, 0))} {t.common.kcal}</span>
          </div>
          {estimate.questions.map((q) => (
            <fieldset key={q.id} className="space-y-2">
              <legend className="mb-2 font-semibold">{q.text}</legend>
              <div className="flex flex-wrap gap-2">
                {q.options.map((o) => {
                  const on = pick[q.id] === o;
                  return (
                    <button
                      key={o}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setPick((p) => ({ ...p, [q.id]: on ? "" : o }))}
                      className={`min-h-12 flex-1 basis-auto whitespace-nowrap rounded-xl border-2 px-4 font-semibold ${on ? "border-accent bg-accent text-on-accent" : "border-grout bg-enamel hover:border-outline"}`}
                    >
                      {o}
                    </button>
                  );
                })}
              </div>
              <input
                className={inputClass}
                placeholder={ai.otherAnswer}
                value={q.options.includes(pick[q.id] ?? "") ? "" : (pick[q.id] ?? "")}
                onChange={(e) => setPick((p) => ({ ...p, [q.id]: e.target.value }))}
                aria-label={`${q.text} — ${ai.otherAnswer}`}
              />
            </fieldset>
          ))}
          <Button className="w-full" loading={estimating} onClick={submitAnswers}>
            {estimating ? ai.estimating : ai.continue}
          </Button>
          <Button variant="quiet" className="w-full" disabled={estimating} onClick={() => setStage("review")}>
            {ai.skipQuestions}
          </Button>
        </Panel>
      )}

      {stage === "review" && (
        <Panel className="space-y-5">
          <div>
            <h2 className="board text-xl">{ai.reviewTitle}</h2>
            <p className="text-sm text-ink-soft">{ai.reviewHelp}</p>
          </div>
          {estimate?.verdict && <Notice tone={estimate.fits_diet === "no" ? "warn" : estimate.fits_diet === "partly" ? "fast" : "info"}>{estimate.verdict}</Notice>}

          <Field label={ai.mealName}>
            <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
          </Field>

          <ul className="space-y-3">
            {items.map((i) => (
              <li key={i.key} className="space-y-2 rounded-xl border-2 border-grout p-3">
                <div className="flex items-start gap-2">
                  <input className={`${inputClass} min-h-11 flex-1 text-base font-semibold`} value={i.name} onChange={(e) => update(i.key, { name: e.target.value })} aria-label={ai.itemName} />
                  <button type="button" onClick={() => setItems((cur) => cur.filter((x) => x.key !== i.key))} className="min-h-11 px-2 text-sm text-ink-soft underline hover:text-kompot">
                    {ai.removeItem}
                  </button>
                </div>
                <div className={`grid gap-2 ${showProtein ? "grid-cols-3" : "grid-cols-2"}`}>
                  <label className="block">
                    <span className="mb-0.5 block text-xs text-ink-soft">{ai.amount} ({i.unit === "pcs" ? ai.pcs : i.unit})</span>
                    <input className={`${inputClass} min-h-11 text-base`} inputMode="decimal" value={i.amount} onChange={(e) => update(i.key, { amount: e.target.value })} />
                  </label>
                  <label className="block">
                    <span className="mb-0.5 block text-xs text-ink-soft">{t.common.kcal}</span>
                    <input className={`${inputClass} min-h-11 text-base font-semibold`} inputMode="numeric" value={i.kcal} onChange={(e) => update(i.key, { kcal: e.target.value.replace(/\D/g, "") })} />
                  </label>
                  {showProtein && (
                    <label className="block">
                      <span className="mb-0.5 block text-xs text-ink-soft">{t.log.protein}</span>
                      <input className={`${inputClass} min-h-11 text-base`} inputMode="decimal" value={i.protein} onChange={(e) => update(i.key, { protein: e.target.value })} />
                    </label>
                  )}
                </div>
                {(i.fromBarcode || i.low) && (
                  <p className="text-xs text-ink-soft">{i.fromBarcode ? ai.fromBarcode : ai.lowConfidence}</p>
                )}
              </li>
            ))}
          </ul>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => setItems((cur) => [...cur, { key: `new-${Date.now()}`, name: "", amount: "", unit: "g", kcal: "", protein: "", fromBarcode: false, low: false }])}
          >
            + {ai.addItem}
          </Button>

          <div className="menu-row text-lg">
            <span className="font-semibold">{ai.total}</span>
            <span className="leader" aria-hidden />
            <span className="value board text-3xl">{fmt(total)} {t.common.kcal}</span>
          </div>

          <WhenPicker value={when} onChange={setWhen} today={today} />

          <Button className="w-full" loading={pending} disabled={!canSave} onClick={save}>
            {pending ? t.common.saving : ai.save}
          </Button>
          <Button variant="quiet" className="w-full" disabled={pending} onClick={reset}>
            {ai.startOver}
          </Button>
        </Panel>
      )}

      {stage === "manual" && (
        <>
          <LogMealForm today={today} showProtein={showProtein} initialDescription={text} />
          <Button variant="quiet" className="w-full" onClick={() => { setNotice(null); setStage("input"); }}>
            {ai.backToAi}
          </Button>
        </>
      )}
    </main>
  );
}
