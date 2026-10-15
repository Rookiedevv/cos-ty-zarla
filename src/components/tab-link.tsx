"use client";

import Link, { useLinkStatus } from "next/link";
import type { ReactNode } from "react";
import { Spinner } from "./ui";

function Pending({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span className="inline-flex items-center gap-1.5">
      {children}
      {/* Fixed-size slot so the label doesn't jump when the spinner appears. */}
      <span aria-hidden className={`inline-flex size-3.5 transition-opacity ${pending ? "opacity-100" : "opacity-0"}`}>
        <Spinner className="size-3.5" />
      </span>
    </span>
  );
}

/** A segmented-control tab (History, Settings) that shows a spinner the moment it's tapped. */
export function TabLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 items-center justify-center rounded-xl px-2 text-center font-semibold ${
        active ? "bg-enamel text-ink shadow-[var(--panel-shadow)]" : "text-ink-soft hover:text-ink active:bg-enamel/60"
      }`}
    >
      <Pending>{children}</Pending>
    </Link>
  );
}

/** Bottom-bar hint: a short accent line above the icon while that screen is loading. */
export function NavPending() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`absolute top-0 left-1/2 h-1 w-10 -translate-x-1/2 rounded-b-full bg-accent transition-opacity ${pending ? "animate-pulse opacity-100" : "opacity-0"}`}
    />
  );
}
