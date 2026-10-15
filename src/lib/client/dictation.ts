"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// The Web Speech API isn't in TypeScript's DOM types; this is the part we use.
interface SpeechResultList {
  length: number;
  [i: number]: { isFinal: boolean; 0: { transcript: string } };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: SpeechResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noop = () => () => {};

/** Joins dictated text onto what's already typed, with one space between. */
export function joinDictation(base: string, spoken: string): string {
  const s = spoken.trim();
  if (!s) return base;
  return base.trim() ? `${base.trimEnd()} ${s}` : s;
}

export type DictationError = "denied" | "failed";

interface ListenOptions {
  lang: "en" | "pl";
  getValue: () => string;
  onText: (v: string) => void;
  shouldContinue: () => boolean;
  onError: (e: DictationError) => void;
  onRecognizer: (r: Recognition) => void;
  onDone: () => void;
}

/** One short listening session; when it ends it starts the next one for as long as shouldContinue() says so. */
function listen(o: ListenOptions): void {
  const C = ctor();
  if (!C) return o.onDone();
  const r = new C();
  r.lang = o.lang === "pl" ? "pl-PL" : "en-GB";
  r.continuous = false;
  r.interimResults = true;
  const base = o.getValue();
  r.onresult = (e) => {
    let spoken = "";
    for (let i = 0; i < e.results.length; i++) spoken += e.results[i][0].transcript;
    o.onText(joinDictation(base, spoken));
  };
  r.onerror = (e) => {
    if (e.error === "no-speech" || e.error === "aborted") return; // a quiet moment; onend restarts
    o.onError(e.error === "not-allowed" || e.error === "service-not-allowed" ? "denied" : "failed");
  };
  r.onend = () => {
    if (o.shouldContinue()) {
      try {
        return listen(o);
      } catch {
        o.onError("failed");
      }
    }
    o.onDone();
  };
  o.onRecognizer(r);
  r.start();
}

/**
 * Dictation into a text value using the browser's speech recognition (Chrome on Android handles Polish).
 * Each listening session is short (it stops after a pause) and is restarted until the person taps Stop:
 * Chrome on Android repeats earlier words in long "continuous" sessions, short ones avoid that.
 */
export function useDictation({ lang, value, onChange }: { lang: "en" | "pl"; value: string; onChange: (v: string) => void }) {
  const supported = useSyncExternalStore(noop, () => ctor() != null, () => false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<DictationError | null>(null);
  const rec = useRef<Recognition | null>(null);
  const want = useRef(false);
  const latest = useRef({ value, onChange });
  useEffect(() => {
    latest.current = { value, onChange };
  });

  const session = useCallback(() => {
    listen({
      lang,
      getValue: () => latest.current.value,
      onText: (v) => latest.current.onChange(v),
      shouldContinue: () => want.current,
      onError: (err) => {
        want.current = false;
        setError(err);
      },
      onRecognizer: (r) => {
        rec.current = r;
      },
      onDone: () => {
        want.current = false;
        rec.current = null;
        setListening(false);
      },
    });
  }, [lang]);

  const start = useCallback(() => {
    setError(null);
    want.current = true;
    setListening(true);
    try {
      session();
    } catch {
      want.current = false;
      setListening(false);
      setError("failed");
    }
  }, [session]);

  const stop = useCallback(() => {
    want.current = false;
    rec.current?.stop();
  }, []);

  // Stop the microphone when leaving the screen.
  useEffect(
    () => () => {
      want.current = false;
      rec.current?.abort();
    },
    [],
  );

  return { supported, listening, error, start, stop };
}
