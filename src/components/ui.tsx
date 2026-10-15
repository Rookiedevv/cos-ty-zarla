import type { ButtonHTMLAttributes, ReactNode } from "react";

/** White enamel panel, like a menu board hung on the tiled wall. */
export function Panel({ children, className = "", as: Tag = "section" }: { children: ReactNode; className?: string; as?: "section" | "div" | "form" }) {
  return (
    <Tag className={`rounded-2xl panel-frame bg-enamel p-4 ${className}`}>{children}</Tag>
  );
}

export function PanelTitle({ children }: { children: ReactNode }) {
  return <h2 className="board mb-3 text-xl">{children}</h2>;
}

/** Small spinning circle; inherits the text colour. */
export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={`shrink-0 animate-spin ${className}`} fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "quiet";
  /** Working: shows a spinner, blocks taps, keeps the button's colours so it reads as busy, not unavailable. */
  loading?: boolean;
};

export function Button({ variant = "primary", className = "", loading = false, disabled, children, ...props }: ButtonProps) {
  const styles = {
    primary: "bg-accent text-on-accent border-accent hover:opacity-90",
    ghost: "bg-enamel text-ink border-outline hover:bg-tile",
    quiet: "bg-transparent text-ink-soft border-transparent underline underline-offset-4 hover:text-ink",
  }[variant];
  const off = loading
    ? "cursor-wait opacity-85"
    : "disabled:cursor-not-allowed disabled:border-grout disabled:bg-grout disabled:text-ink-soft";
  return (
    <button {...props} disabled={disabled || loading} aria-busy={loading || undefined} className={`min-h-12 rounded-xl border-2 px-4 font-semibold ${off} ${styles} ${className}`}>
      {loading ? (
        <span className="inline-flex items-center justify-center gap-2">
          <Spinner />
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-semibold">{label}</span>
      {hint && <span className="mb-2 block text-sm text-ink-soft">{hint}</span>}
      {children}
    </label>
  );
}

export const inputClass =
  "w-full min-h-12 rounded-xl border-2 border-grout bg-enamel px-3 py-2 text-lg focus:border-accent outline-none";

export interface Choice<V extends string> {
  value: V;
  label: string;
  desc?: string;
}

/** A set of large tappable options backed by radio inputs. */
export function ChoiceGroup<V extends string>({
  name,
  legend,
  choices,
  value,
  onChange,
  columns = 1,
}: {
  name: string;
  legend?: string;
  choices: Choice<V>[];
  value: V | null | undefined;
  onChange: (v: V) => void;
  columns?: 1 | 2 | 3 | 5;
}) {
  // Literal class names so Tailwind can see them. Multi-column grids fall back to one column on very narrow phones.
  const cols = {
    1: "grid-cols-1",
    2: "grid-cols-1 min-[360px]:grid-cols-2",
    3: "grid-cols-1 min-[360px]:grid-cols-3",
    5: "grid-cols-1 min-[360px]:grid-cols-5",
  }[columns];
  // Short options (no description) wrap as pills sized to their text, so labels never break mid-word.
  const pills = choices.every((c) => !c.desc);
  return (
    <fieldset>
      {legend && <legend className="mb-2 font-semibold">{legend}</legend>}
      <div className={pills ? "flex flex-wrap gap-2" : `grid gap-2 ${cols}`}>
        {choices.map((c) => {
          const checked = value === c.value;
          return (
            <label
              key={c.value}
              className={`cursor-pointer rounded-xl border-2 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-[var(--focus)] ${
                pills ? "flex min-h-12 flex-1 basis-auto items-center justify-center whitespace-nowrap px-4 text-center" : "px-3 py-2.5"
              } ${checked ? "border-accent bg-accent text-on-accent" : "border-grout bg-enamel hover:border-outline"}`}
            >
              <input
                type="radio"
                className="sr-only"
                name={name}
                value={c.value}
                checked={checked}
                onChange={() => onChange(c.value)}
              />
              <span className="block font-semibold leading-tight">{c.label}</span>
              {c.desc && <span className={`block text-sm leading-snug ${checked ? "opacity-85" : "text-ink-soft"}`}>{c.desc}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "fast"; children: ReactNode }) {
  const styles = {
    info: "border-grout bg-tile text-ink",
    warn: "border-kompot text-kompot bg-enamel",
    fast: "border-mustard bg-mustard-bg text-ink",
  }[tone];
  return <div className={`rounded-xl border-2 px-3 py-2 text-sm ${styles}`}>{children}</div>;
}

export const fmt = (n: number) => new Intl.NumberFormat("pl-PL").format(Math.round(n));

/** Decimal number in the reader's language (0,53 in Polish, 0.53 in English). */
export const dec = (lang: "en" | "pl", n: number, digits = 2) =>
  new Intl.NumberFormat(lang === "en" ? "en-GB" : "pl-PL", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
