"use client";

import { createContext, useContext, type ReactNode } from "react";
import { getDict, type Dict, type Lang } from "./index";

const LangContext = createContext<Lang>("pl");

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useT(): Dict {
  return getDict(useContext(LangContext));
}

export function useLang(): Lang {
  return useContext(LangContext);
}
