"use client";

import { useEffect, useState, useTransition } from "react";
import {
  getPushPublicKey,
  removePushSubscription,
  saveNotificationPrefs,
  savePushSubscription,
  sendTestNotification,
} from "@/app/actions";
import { useT } from "@/lib/i18n/client";
import { PREF_KEYS, type PrefKey } from "@/lib/notify/rules";
import { Button, Notice, Panel, PanelTitle } from "./ui";

type Status = "checking" | "unsupported" | "blocked" | "off" | "on";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

export function NotificationSettings({ prefs }: { prefs: Partial<Record<PrefKey, boolean>> }) {
  const t = useT().notifySettings;
  const [status, setStatus] = useState<Status>("checking");
  const [message, setMessage] = useState<{ tone: "info" | "warn"; text: string } | null>(null);
  const [values, setValues] = useState(() => Object.fromEntries(PREF_KEYS.map((k) => [k, prefs[k] !== false])) as Record<PrefKey, boolean>);
  const [installed, setInstalled] = useState(true);
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setStatus("unsupported");
      setInstalled(window.matchMedia("(display-mode: standalone)").matches);
      if (Notification.permission === "denied") return setStatus("blocked");
      setStatus((await currentSubscription()) ? "on" : "off");
    })();
  }, []);

  const enable = () =>
    start(async () => {
      setMessage(null);
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setStatus(permission === "denied" ? "blocked" : "off");
      const key = await getPushPublicKey();
      if (!key) return setMessage({ tone: "warn", text: t.unavailable });
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
      const r = await savePushSubscription(sub.toJSON(), navigator.userAgent);
      if (r.ok) setStatus("on");
      else setMessage({ tone: "warn", text: t.testFailed });
    });

  const disable = () =>
    start(async () => {
      setMessage(null);
      const sub = await currentSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus("off");
    });

  const test = () =>
    start(async () => {
      const r = await sendTestNotification();
      setMessage(r.ok ? { tone: "info", text: t.testSent } : { tone: "warn", text: t.testFailed });
    });

  const toggle = (k: PrefKey) => {
    const next = { ...values, [k]: !values[k] };
    setValues(next);
    start(async () => void (await saveNotificationPrefs(next)));
  };

  return (
    <Panel>
      <PanelTitle>{t.title}</PanelTitle>
      <div className="space-y-3">
        {status === "unsupported" && <Notice tone="warn">{t.unsupported}</Notice>}
        {status === "blocked" && <Notice tone="warn">{t.blocked}</Notice>}
        {status === "off" && (
          <>
            {!installed && <p className="text-sm text-ink-soft">{t.installFirst}</p>}
            <Button className="w-full" onClick={enable} disabled={pending}>
              {pending ? t.enabling : t.enable}
            </Button>
          </>
        )}
        {status === "on" && (
          <>
            <p className="flex items-center gap-2 font-semibold">
              <svg aria-hidden viewBox="0 0 24 24" className="size-5 text-accent" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12l5 5 9-10" />
              </svg>
              {t.onHere}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" className="flex-1 whitespace-nowrap" onClick={test} disabled={pending}>
                {t.test}
              </Button>
              <Button variant="quiet" onClick={disable} disabled={pending}>
                {t.turnOffHere}
              </Button>
            </div>
          </>
        )}
        {message && <Notice tone={message.tone}>{message.text}</Notice>}

        <ul className="divide-y divide-grout pt-1">
          {PREF_KEYS.map((k) => (
            <li key={k}>
              <label className="flex min-h-14 cursor-pointer items-center justify-between gap-3 py-2">
                <span>
                  <span className="block font-semibold">{t.kinds[k][0]}</span>
                  <span className="block text-sm text-ink-soft">{t.kinds[k][1]}</span>
                </span>
                <input type="checkbox" role="switch" className="peer sr-only" checked={values[k]} onChange={() => toggle(k)} />
                <span
                  aria-hidden
                  className="relative h-7 w-12 shrink-0 rounded-full bg-grout transition-colors peer-checked:bg-accent peer-focus-visible:outline-3 peer-focus-visible:outline-[var(--focus)] after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5"
                />
              </label>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
