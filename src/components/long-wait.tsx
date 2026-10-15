"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { Button, Spinner } from "./ui";

/** Waits longer than this many ms are treated as failed (the server call may still finish; its late result is ignored). */
export const WAIT_TIMEOUT_MS = 45_000;

/** Resolves to "timeout" if `p` hasn't settled within `ms`. */
export function withTimeout<T>(p: Promise<T>, ms = WAIT_TIMEOUT_MS): Promise<T | "timeout"> {
  return Promise.race([p, new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms))]);
}

/**
 * What the app is doing during a long wait (AI, emails): the current step, a bar that
 * keeps moving, the steps already done, and a "still working" line when it runs long.
 * Mount it with a fresh `key` for each attempt so the clock restarts.
 */
export function LongWait({ steps, expectedSec = 10 }: { steps: string[]; expectedSec?: number }) {
  const t = useT().wait;
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const elapsed = (now - startedAt) / 1000;
  const step = Math.min(steps.length - 1, Math.floor(elapsed / (expectedSec / steps.length)));
  // Eases towards 95% and never stops moving, so a slow answer still looks alive.
  const pct = 95 * (1 - Math.exp(-elapsed / (expectedSec * 0.7)));
  const slow = elapsed > Math.max(10, expectedSec * 1.3);

  return (
    <div role="status" aria-live="polite" className="rounded-2xl panel-frame bg-enamel p-4">
      <p className="flex items-center gap-2 font-semibold">
        <Spinner className="size-5 text-accent" />
        {steps[step]}
      </p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-grout">
        <div className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out" style={{ width: `${Math.max(4, pct)}%` }} />
      </div>
      {steps.length > 1 && (
        <ol className="mt-3 space-y-1 text-sm">
          {steps.map((s, i) => (
            <li key={s} className={`flex items-center gap-2 ${i < step ? "text-ink" : i === step ? "font-semibold text-ink" : "text-ink-soft"}`}>
              <span aria-hidden className={`w-4 text-center ${i < step ? "text-good" : ""}`}>
                {i < step ? "✓" : i === step ? "•" : "○"}
              </span>
              {s}
            </li>
          ))}
        </ol>
      )}
      {slow && <p className="mt-3 text-sm text-ink-soft">{t.slow}</p>}
    </div>
  );
}

/** Shown when a long wait gave up: plain message and a retry button. */
export function WaitFailed({ onRetry, message }: { onRetry: () => void; message?: string }) {
  const t = useT().wait;
  return (
    <div role="alert" className="space-y-3 rounded-2xl border-2 border-kompot bg-enamel p-4">
      <p className="font-semibold text-kompot">{message ?? t.timeout}</p>
      <Button className="w-full" onClick={onRetry}>
        {t.retry}
      </Button>
    </div>
  );
}
