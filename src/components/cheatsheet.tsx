import type { Cheatsheet } from "@/lib/diet/cheatsheets";
import { getDict, type Lang } from "@/lib/i18n";
import { Panel } from "./ui";

function List({ title, items, mark, tone }: { title: string; items: string[]; mark: string; tone: string }) {
  return (
    <div>
      <h3 className="mb-1.5 font-semibold">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden className={`w-4 shrink-0 text-center font-bold ${tone}`}>
              {mark}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One method or food focus, in full. */
export function CheatsheetCard({ eyebrow, name, sheet, lang, current }: { eyebrow: string; name: string; sheet: Cheatsheet; lang: Lang; current?: boolean }) {
  const t = getDict(lang).guide;
  return (
    <Panel className="space-y-4">
      <div>
        <p className="text-sm text-ink-soft">
          {eyebrow}
          {current && <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-on-accent">{t.current}</span>}
        </p>
        <h2 className="board text-2xl">{name}</h2>
        <p className="mt-1">{sheet.summary}</p>
      </div>
      <List title={t.how} items={sheet.how} mark="·" tone="text-ink-soft" />
      <List title={t.focusOn} items={sheet.focus} mark="+" tone="text-accent" />
      <List title={t.avoid} items={sheet.avoid} mark="−" tone="text-kompot" />
      <List title={t.tips} items={sheet.tips} mark="›" tone="text-ink-soft" />
    </Panel>
  );
}
