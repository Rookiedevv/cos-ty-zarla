"use client";

import { useState } from "react";

export interface WeightPoint {
  date: string; // YYYY-MM-DD
  kg: number;
}

const W = 340;
const H = 180;
const PAD = { top: 16, right: 16, bottom: 26, left: 40 };

/**
 * Single-series line of weigh-ins over time. Tap (or hover) a point to see its value.
 * One series, so no legend: the panel title names it.
 */
export function WeightChart({ points, lang, title }: { points: WeightPoint[]; lang: "en" | "pl"; title: string }) {
  const [active, setActive] = useState<number | null>(points.length ? points.length - 1 : null);
  if (points.length === 0) return null;

  const locale = lang === "en" ? "en-GB" : "pl-PL";
  const day = (d: string) => Date.parse(`${d}T12:00:00Z`);
  const t0 = day(points[0].date);
  const t1 = Math.max(day(points[points.length - 1].date), t0 + 6 * 86400000); // at least a week wide

  const kgs = points.map((p) => p.kg);
  // Clean 1 kg ticks with a little air above and below.
  let lo = Math.floor(Math.min(...kgs) - 0.5);
  let hi = Math.ceil(Math.max(...kgs) + 0.5);
  if (hi - lo < 3) {
    const mid = (hi + lo) / 2;
    lo = Math.floor(mid - 1.5);
    hi = lo + 3;
  }
  const step = Math.max(1, Math.ceil((hi - lo) / 4));
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);

  const x = (d: string) => PAD.left + ((day(d) - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
  const y = (kg: number) => PAD.top + (1 - (kg - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.kg).toFixed(1)}`).join(" ");
  const fmtDate = (d: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  const fmtKg = (kg: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(kg);

  const a = active != null ? points[active] : null;
  return (
    <figure>
      <figcaption className="mb-1 h-5 text-sm" aria-live="polite">
        {a && (
          <>
            <span className="text-ink-soft">{fmtDate(a.date, { weekday: "short", day: "numeric", month: "short" })} · </span>
            <span className="font-semibold">{fmtKg(a.kg)} kg</span>
          </>
        )}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-manipulation" role="img" aria-label={title}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--grout)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--ink-soft)">
              {v}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={H - 6} fontSize={11} fill="var(--ink-soft)">
          {fmtDate(points[0].date, { day: "numeric", month: "short" })}
        </text>
        <text x={W - PAD.right} y={H - 6} fontSize={11} textAnchor="end" fill="var(--ink-soft)">
          {fmtDate(points[points.length - 1].date, { day: "numeric", month: "short" })}
        </text>

        <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) => (
          <g key={p.date} onClick={() => setActive(i)} onMouseEnter={() => setActive(i)} className="cursor-pointer">
            {/* Larger invisible hit area than the dot. */}
            <circle cx={x(p.date)} cy={y(p.kg)} r={14} fill="transparent" />
            <circle
              cx={x(p.date)}
              cy={y(p.kg)}
              r={i === active ? 6 : 4}
              fill="var(--accent)"
              stroke="var(--enamel)"
              strokeWidth={2}
            />
          </g>
        ))}

      </svg>
    </figure>
  );
}
