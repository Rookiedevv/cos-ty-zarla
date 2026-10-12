"use client";

import { useState, useTransition } from "react";
import { addAllowedEmail, removeAllowedEmail } from "@/app/actions";
import { useT } from "@/lib/i18n/client";
import { Button, Panel, PanelTitle, inputClass } from "./ui";

export function AllowList({ emails, self }: { emails: string[]; self: string }) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Panel>
      <PanelTitle>{t.settings.admin}</PanelTitle>
      <p className="mb-3 text-sm text-ink-soft">{t.settings.adminHelp}</p>
      <ul className="mb-3 space-y-1">
        {emails.map((e) => (
          <li key={e} className="menu-row">
            <span className="min-w-0 truncate">{e}</span>
            <span className="leader" aria-hidden />
            {e !== self && (
              <button
                type="button"
                className="value text-sm text-ink-soft underline hover:text-kompot"
                disabled={pending}
                onClick={() => start(async () => void (await removeAllowedEmail(e)))}
              >
                {t.settings.remove}
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          start(async () => {
            const r = await addAllowedEmail(email);
            if (r.ok) {
              setEmail("");
              setError(null);
            } else setError(t.common.errorGeneric);
          });
        }}
      >
        <input type="email" required className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com" aria-label={t.settings.addEmail} />
        <Button type="submit" disabled={pending}>
          {t.settings.addEmail}
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-kompot">{error}</p>}
    </Panel>
  );
}
