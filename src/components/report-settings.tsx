"use client";

import { useState, useTransition } from "react";
import { approveFollow, removeFollow, requestFollow, saveEmailPrefs } from "@/app/actions";
import { useT } from "@/lib/i18n/client";
import type { EmailPrefKey } from "@/lib/profile";
import { Button, Notice, Panel, PanelTitle } from "./ui";

const KEYS: EmailPrefKey[] = ["daily", "weekly", "friend"];

export interface Person {
  id: string;
  name: string;
}

function Switch({ checked, onChange, title, hint }: { checked: boolean; onChange: () => void; title: string; hint: string }) {
  return (
    <label className="flex min-h-14 cursor-pointer items-center justify-between gap-3 py-2">
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-ink-soft">{hint}</span>
      </span>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={onChange} />
      <span
        aria-hidden
        className="relative h-7 w-12 shrink-0 rounded-full bg-grout transition-colors peer-checked:bg-accent peer-focus-visible:outline-3 peer-focus-visible:outline-[var(--focus)] after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5"
      />
    </label>
  );
}

/** Which reports also come by email. */
export function EmailReportSettings({ prefs, configured }: { prefs: Partial<Record<EmailPrefKey, boolean>>; configured: boolean }) {
  const t = useT().reports;
  const [values, setValues] = useState(() => Object.fromEntries(KEYS.map((k) => [k, prefs[k] !== false])) as Record<EmailPrefKey, boolean>);
  const [, start] = useTransition();
  const label = { daily: t.emailDaily, weekly: t.emailWeekly, friend: t.emailFriend };

  return (
    <Panel>
      <PanelTitle>{t.emailTitle}</PanelTitle>
      <p className="text-sm text-ink-soft">{t.emailHelp}</p>
      {!configured && (
        <div className="mt-2">
          <Notice tone="info">{t.emailNotSetup}</Notice>
        </div>
      )}
      <ul className="divide-y divide-grout pt-1">
        {KEYS.map((k) => (
          <li key={k}>
            <Switch
              checked={values[k]}
              title={label[k][0]}
              hint={label[k][1]}
              onChange={() => {
                const next = { ...values, [k]: !values[k] };
                setValues(next);
                start(async () => void (await saveEmailPrefs(next)));
              }}
            />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Ask to follow someone, approve people who want to follow you, and end either at any time. */
export function FollowSettings({
  selfId,
  people,
  outgoing,
  incoming,
  followers,
}: {
  selfId: string;
  people: Person[];
  /** Status of my requests, by the person's id. */
  outgoing: Record<string, "pending" | "approved">;
  /** Pending requests to follow me. */
  incoming: Person[];
  /** Approved followers. */
  followers: Person[];
}) {
  const t = useT().reports;
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => start(async () => void (await fn()));
  const small = "min-h-11 shrink-0 px-3 text-sm";

  return (
    <Panel>
      <div id="follow" className="scroll-mt-4" />
      <PanelTitle>{t.followTitle}</PanelTitle>
      <p className="text-sm text-ink-soft">{t.followHelp}</p>

      {incoming.length > 0 && (
        <div className="mt-3 rounded-xl bg-tile p-3">
          <h3 className="text-sm font-semibold">{t.requestsTitle}</h3>
          <ul className="mt-1 divide-y divide-grout">
            {incoming.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0 font-semibold break-words">{p.name}</span>
                <span className="flex gap-2">
                  <Button variant="ghost" className={small} disabled={pending} onClick={() => run(() => removeFollow(p.id, selfId))}>
                    {t.decline}
                  </Button>
                  <Button className={small} disabled={pending} onClick={() => run(() => approveFollow(p.id))}>
                    {t.accept}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {people.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">{t.noPeople}</p>
      ) : (
        <ul className="mt-2 divide-y divide-grout">
          {people.map((p) => {
            const status = outgoing[p.id];
            return (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="block font-semibold break-words">{p.name}</span>
                  {status && (
                    <span className={`block text-sm ${status === "approved" ? "text-good" : "text-ink-soft"}`}>
                      {status === "approved" ? `✓ ${t.following}` : t.requested}
                    </span>
                  )}
                </span>
                {status ? (
                  <Button variant="ghost" className={small} disabled={pending} onClick={() => run(() => removeFollow(selfId, p.id))}>
                    {status === "approved" ? t.stop : t.cancel}
                  </Button>
                ) : (
                  <Button className={small} disabled={pending} onClick={() => run(() => requestFollow(p.id))}>
                    {t.follow}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {followers.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-semibold text-ink-soft">{t.followers}</h3>
          <ul className="divide-y divide-grout">
            {followers.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0 break-words">{p.name}</span>
                <Button variant="ghost" className={small} disabled={pending} onClick={() => run(() => removeFollow(p.id, selfId))}>
                  {t.removeFollower}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
