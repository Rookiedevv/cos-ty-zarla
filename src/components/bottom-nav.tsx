"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { NavPending } from "./tab-link";

const icons = {
  today: <path d="M4 12a8 8 0 1 0 16 0a8 8 0 1 0 -16 0M12 7v5l3 2" />,
  history: <path d="M5 5h14v15H5zM5 10h14M9 3v4M15 3v4" />,
  settings: <path d="M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6" />,
};

function Icon({ name }: { name: keyof typeof icons }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {icons[name]}
    </svg>
  );
}

export function BottomNav() {
  const t = useT();
  const path = usePathname();
  const tab = (href: string, label: string, icon: keyof typeof icons) => {
    const active = href === "/" ? path === "/" : path.startsWith(href);
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-semibold active:scale-95 ${active ? "text-ink" : "text-ink-soft"}`}
      >
        <NavPending />
        <Icon name={icon} />
        {label}
      </Link>
    );
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-grout bg-enamel pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-lg items-center px-2">
        {tab("/", t.nav.today, "today")}
        <Link
          href="/log"
          className="-mt-6 mx-2 flex size-16 items-center justify-center rounded-full border-2 border-outline bg-accent text-on-accent shadow-[var(--panel-shadow)] transition-transform active:scale-90"
          aria-label={t.today.logMeal}
        >
          <svg aria-hidden viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </Link>
        {tab("/history", t.nav.history, "history")}
        {tab("/settings", t.nav.settings, "settings")}
      </div>
    </nav>
  );
}
