"use client";

import { useState, useTransition } from "react";
import { createPairingCode, disconnectDevice } from "@/app/actions";
import { useT } from "@/lib/i18n/client";
import { Button, Notice, Panel, PanelTitle } from "./ui";

export interface Device {
  id: string;
  label: string | null;
  created_at: string;
  last_sync_at: string | null;
}

export const APK_URL =
  process.env.NEXT_PUBLIC_COMPANION_APK_URL ?? "https://github.com/Rookiedevv/cos-ty-zarla/releases/latest/download/cos-ty-zarla-sync.apk";

export function WatchSettings({ devices, nowIso }: { devices: Device[]; nowIso: string }) {
  const t = useT();
  const w = t.watch;
  const [code, setCode] = useState<{ code: string; minutes: number } | null>(null);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();
  const now = Date.parse(nowIso);

  const connect = () =>
    start(async () => {
      setError(false);
      const r = await createPairingCode();
      if (r.ok) setCode({ code: r.code, minutes: Math.round((Date.parse(r.expiresAt) - Date.now()) / 60000) });
      else setError(true);
    });

  return (
    <Panel>
      <PanelTitle>{w.title}</PanelTitle>
      <p className="mb-3 text-sm text-ink-soft">{w.help}</p>

      {devices.length === 0 && !code && <p className="mb-3">{w.none}</p>}
      {devices.length > 0 && (
        <ul className="mb-3 divide-y divide-grout">
          {devices.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-2">
              <span>
                <span className="block font-semibold">{d.label || "Android"}</span>
                <span className="block text-sm text-ink-soft">
                  {d.last_sync_at
                    ? w.lastSync(t.today.ago(Math.max(0, Math.round((now - Date.parse(d.last_sync_at)) / 60000))))
                    : w.neverSynced}
                </span>
              </span>
              <Button variant="quiet" disabled={pending} onClick={() => start(async () => void (await disconnectDevice(d.id)))}>
                {w.disconnect}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {code ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-tile px-4 py-3 text-center">
            <p className="text-sm text-ink-soft">{w.codeTitle}</p>
            <p className="board select-all text-4xl tracking-wider" aria-live="polite">{code.code}</p>
            <p className="text-sm text-ink-soft">{w.codeValid(code.minutes)}</p>
          </div>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {w.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <a href={APK_URL} className="flex min-h-12 items-center justify-center rounded-xl border-2 border-accent bg-accent px-4 font-semibold text-on-accent">
            {w.download}
          </a>
          <Button variant="quiet" className="w-full" onClick={() => setCode(null)}>
            {w.done}
          </Button>
        </div>
      ) : (
        <Button variant="ghost" className="w-full" disabled={pending} onClick={connect}>
          {pending ? w.connecting : w.connect}
        </Button>
      )}
      {error && <div className="mt-3"><Notice tone="warn">{t.common.errorGeneric}</Notice></div>}
    </Panel>
  );
}
