"use client";

import { useState, useTransition } from "react";
import { deleteRecipe, renameRecipe, setRecipeHidden } from "@/app/actions";
import { useT } from "@/lib/i18n/client";
import { gramsPerPortion, perPortion, type SavedRecipe } from "@/lib/recipes";
import { withTimeout } from "./long-wait";
import { Button, Panel, fmt, inputClass } from "./ui";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={`size-4 shrink-0 self-center text-ink-soft transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function RecipeRow({ recipe }: { recipe: SavedRecipe }) {
  const t = useT();
  const r = t.recipe;
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(recipe.name);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  const grams = gramsPerPortion(recipe);
  const panelId = `recipe-${recipe.id}`;

  const run = (action: () => Promise<{ ok: boolean }>, after?: () => void) =>
    start(async () => {
      setFailed(false);
      const res = await withTimeout(action());
      if (res === "timeout" || !res.ok) setFailed(true);
      else after?.();
    });

  return (
    <li className="border-b-2 border-grout last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="menu-row -mx-2 w-[calc(100%+1rem)] rounded-lg px-2 py-2 text-left hover:bg-tile"
      >
        <span className="min-w-0">
          <span className="block font-semibold leading-tight">{recipe.name}</span>
          <span className="block text-xs text-ink-soft">
            {recipe.mine ? r.you : recipe.owner} · {r.portionsCount(recipe.portions)}
            {grams ? ` · ${r.gramsPerPortion(fmt(grams))}` : ""}
          </span>
        </span>
        <span className="leader" aria-hidden />
        <span className="value whitespace-nowrap font-semibold">
          {fmt(perPortion(recipe))} {t.common.kcal} <span className="text-xs font-normal text-ink-soft">{r.perPortionShort}</span>
        </span>
        <Chevron open={open} />
      </button>

      {open && (
        <div id={panelId} className="space-y-3 pb-3 pl-1 text-sm">
          <ul className="space-y-1">
            {recipe.items.map((i, n) => (
              <li key={`${n}-${i.name}`} className="menu-row">
                <span className="min-w-0">
                  {i.name}
                  <span className="text-ink-soft"> · {fmt(i.amount)} {i.unit === "pcs" ? r.pcs : i.unit}</span>
                </span>
                <span className="leader" aria-hidden />
                <span className="value tabular-nums">{fmt(i.kcal)}</span>
              </li>
            ))}
            <li className="menu-row font-semibold">
              <span>{r.wholeDish}</span>
              <span className="leader" aria-hidden />
              <span className="value">{fmt(recipe.total_kcal)} {t.common.kcal}</span>
            </li>
          </ul>
          {recipe.assumptions && <p className="text-ink-soft">{recipe.assumptions}</p>}
          <details>
            <summary className="cursor-pointer text-ink-soft">{r.description}</summary>
            <p className="mt-1 whitespace-pre-wrap break-words">{recipe.description}</p>
          </details>

          {failed && <p role="alert" className="text-kompot">{r.actionFailed}</p>}

          {recipe.mine ? (
            renaming ? (
              <div className="space-y-2">
                <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} aria-label={r.saveName} />
                <div className="grid grid-cols-2 gap-2">
                  <Button loading={pending} disabled={!name.trim()} onClick={() => run(() => renameRecipe(recipe.id, name), () => setRenaming(false))}>
                    {r.renameSave}
                  </Button>
                  <Button variant="ghost" disabled={pending} onClick={() => { setName(recipe.name); setRenaming(false); }}>
                    {t.common.cancel}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-4">
                <button type="button" className="min-h-11 font-semibold text-accent underline underline-offset-4" onClick={() => setRenaming(true)}>
                  {r.rename}
                </button>
                <button
                  type="button"
                  className="min-h-11 font-semibold text-kompot underline underline-offset-4 disabled:opacity-50"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(r.deleteConfirm)) run(() => deleteRecipe(recipe.id));
                  }}
                >
                  {r.delete}
                </button>
              </div>
            )
          ) : (
            <Button variant="ghost" className="w-full" loading={pending} onClick={() => run(() => setRecipeHidden(recipe.id, !recipe.hidden))}>
              {recipe.hidden ? r.show : r.hide}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

/** Everyone's saved recipes; other people's that you hid sit in a folded "Hidden" list at the bottom. */
export function SavedRecipes({ recipes }: { recipes: SavedRecipe[] }) {
  const r = useT().recipe;
  const visible = recipes.filter((x) => !x.hidden);
  const hidden = recipes.filter((x) => x.hidden);

  if (recipes.length === 0) {
    return (
      <Panel>
        <p className="text-ink-soft">{r.savedEmpty}</p>
      </Panel>
    );
  }

  return (
    <>
      <Panel>
        {visible.length ? (
          <ul>
            {visible.map((x) => (
              <RecipeRow key={x.id} recipe={x} />
            ))}
          </ul>
        ) : (
          <p className="text-ink-soft">{r.savedEmpty}</p>
        )}
      </Panel>
      {hidden.length > 0 && (
        <Panel>
          <details>
            <summary className="cursor-pointer font-semibold text-ink-soft">{r.hiddenTitle(hidden.length)}</summary>
            <ul className="mt-2">
              {hidden.map((x) => (
                <RecipeRow key={x.id} recipe={x} />
              ))}
            </ul>
          </details>
        </Panel>
      )}
    </>
  );
}
