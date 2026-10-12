"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { estimateMealAction, logMeal, type EstimateResponse } from "@/app/actions";
import type { Estimate } from "@/lib/ai/estimate";
import { preparePhoto, type PreparedPhoto } from "@/lib/client/photo";
import { useT } from "@/lib/i18n/client";
import { LogMealForm } from "./log-meal-form";
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
  initial,
}: {
  today: string;
  showProtein: boolean;
  /** Start at a given step with an existing estimate (used for previews). */
  initial?: { stage: Stage; estimate: Estimate };
}) {
  const t = useT();
  const ai = t.ai;
  const router = useRouter();
  const [stage, setStage] = useState<Stage>(initial?.stage ?? "input");
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [text, setText] = useState("");
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
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setPreparing(true);
    setNotice(null);
    try {
      setPhoto(await preparePhoto(file));
    } catch {
      setNotice({ tone: "warn", text: ai.failed });
    } finally {
      setPreparing(false);
    }
  };

  const errorText = (r: Extract<EstimateResponse, { ok: false }>) =>
    r.error === "ai_paused" ? ai.paused : r.error === "not_configured" ? ai.notConfigured : r.error === "invalid" ? ai.needInput : ai.failed;

  const runEstimate = (nextRound: number, allAnswers: { question: string; answer: string }[]) =>
    start(async () => {
      setNotice(null);
      const r = await estimateMealAction({
        photo: photo ? { data: photo.data, mediaType: photo.mediaType } : undefined,
        text: text.trim() || undefined,
        barcodes: photo?.barcodes ?? [],
        answers: allAnswers,
        round: nextRound,
      });
      if (!r.ok) {
        setNotice({ tone: "warn", text: errorText(r) });
        if (r.error === "ai_paused" || r.error === "not_configured") setStage("manual");
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
      const r = await logMeal({
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
        ...whenPayload(when),
      });
      if (r.ok) router.push("/");
      else setNotice({ tone: "warn", text: t.common.errorGeneric });
    });

  const reset = () => {
    setStage("input");
    setPhoto(null);
    setText("");
    setEstimate(null);
    setAnswers([]);
    setItems([]);
    setRound(1);
    setNotice(null);
  };

  const update = (key: string, patch: Partial<DraftItem>) => setItems((cur) => cur.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  return (
    <main className="space-y-4 pt-2">
      <h1 className="board text-3xl">{ai.title}</h1>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      {stage === "input" && (
        <Panel className="space-y-5">
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />

          {photo ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview of an unsent photo */}
              <img src={photo.previewUrl} alt="" className="max-h-72 w-full rounded-xl object-cover" />
              {photo.barcodes.map((b) => (
                <p key={b} className="text-sm font-semibold text-accent">{ai.barcodeFound(b)}</p>
              ))}
              <Button variant="quiet" onClick={() => setPhoto(null)}>{ai.removePhoto}</Button>
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

          <Field label={ai.describeLabel} hint={photo ? ai.describeOptional : undefined}>
            <textarea className={`${inputClass} min-h-24`} value={text} onChange={(e) => setText(e.target.value)} placeholder={ai.describePlaceholder} maxLength={1500} />
          </Field>

          <Button className="w-full" disabled={pending || preparing || (!photo && !text.trim())} onClick={() => runEstimate(1, [])}>
            {pending ? ai.estimating : ai.estimate}
          </Button>
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
          <Button className="w-full" disabled={pending} onClick={submitAnswers}>
            {pending ? ai.estimating : ai.continue}
          </Button>
          <Button variant="quiet" className="w-full" disabled={pending} onClick={() => setStage("review")}>
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

          <Button className="w-full" disabled={!canSave || pending} onClick={save}>
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
