"use client";

import { useEffect } from "react";
import { Button, Panel } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

/** Instead of a blank "Application error" page: a plain message and a retry. The bottom bar stays usable. */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useT();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="pt-2">
      <Panel className="space-y-3">
        <h1 className="board text-2xl">{t.wait.crashTitle}</h1>
        <p className="text-ink-soft">{t.wait.crashBody}</p>
        <Button className="w-full" onClick={() => retry()}>
          {t.wait.retry}
        </Button>
      </Panel>
    </main>
  );
}
