"use client";

import { useState } from "react";
import { drawDay, type ShareDay } from "@/lib/client/day-image";
import { useT } from "@/lib/i18n/client";
import { Spinner } from "./ui";

/**
 * Makes a picture of the day's meals and opens the phone's share menu (Messenger, WhatsApp…).
 * Where a browser can't share pictures, the picture is downloaded instead.
 */
export function ShareDayButton({ day, fileDate }: { day: ShareDay; fileDate: string }) {
  const t = useT().today;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const share = async () => {
    setBusy(true);
    setNote(null);
    try {
      // The app font must be loaded before drawing, or the picture falls back to a system font.
      await Promise.all([400, 500, 600, 700, 800].map((w) => document.fonts.load(`${w} 32px "Bricolage Grotesque Variable"`, "ąęłńóśźżĄĘŁŃÓŚŹŻ"))).catch(() => {});
      const canvas = drawDay(day);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
      if (!blob) throw new Error("no image");
      const file = new File([blob], `zarla-${fileDate}.png`, { type: "image/png" });

      const download = () => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        setNote(t.shareDownloaded);
      };
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: day.heading });
        } catch (e) {
          // Closing the share menu is fine. Anything else (e.g. a slow phone let the tap "expire") → download instead.
          if ((e as Error).name !== "AbortError") download();
        }
      } else download();
    } catch (e) {
      console.error("share failed", e);
      setNote(t.shareFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={share}
        disabled={busy}
        aria-busy={busy || undefined}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-outline px-3 text-sm font-semibold hover:bg-tile disabled:cursor-wait disabled:opacity-80"
      >
        {busy ? (
          <Spinner />
        ) : (
          <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
          </svg>
        )}
        {t.share}
      </button>
      {note && <p role="status" className="mt-1 text-xs text-ink-soft">{note}</p>}
    </div>
  );
}
