"use client";

import { useState } from "react";
import { useLang, useT } from "@/lib/i18n/client";
import { inputClass } from "./ui";

/**
 * Date of birth as three quick fields (day, month, year) instead of a
 * calendar, so nobody has to page back 35 years. Emits YYYY-MM-DD, or ""
 * while incomplete or invalid.
 */
export function BirthDateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT();
  const lang = useLang();
  const [y0, m0, d0] = value ? value.split("-") : ["", "", ""];
  const [day, setDay] = useState(d0 ? String(Number(d0)) : "");
  const [month, setMonth] = useState(m0 ? String(Number(m0)) : "");
  const [year, setYear] = useState(y0);

  const months = Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "pl-PL", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2000, i, 1))),
  );

  const emit = (d: string, m: string, y: string) => {
    const dd = Number(d), mm = Number(m), yy = Number(y);
    const valid =
      y.length === 4 && yy >= 1930 && yy <= 2010 && mm >= 1 && mm <= 12 && dd >= 1 &&
      dd <= new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    onChange(valid ? `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}` : "");
  };

  const [dayLabel, monthLabel, yearLabel] = t.onboarding.dobParts;
  return (
    <fieldset>
      <legend className="mb-1 font-semibold">{t.onboarding.dob}</legend>
      <div className="grid grid-cols-[4.5rem_1fr_5.5rem] gap-2">
        <input
          className={`${inputClass} text-center`}
          inputMode="numeric"
          autoComplete="bday-day"
          placeholder="DD"
          maxLength={2}
          aria-label={dayLabel}
          value={day}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            setDay(v);
            emit(v, month, year);
          }}
        />
        <select
          className={`${inputClass} min-w-0 px-2`}
          autoComplete="bday-month"
          aria-label={monthLabel}
          value={month}
          onChange={(e) => {
            setMonth(e.target.value);
            emit(day, e.target.value, year);
          }}
        >
          <option value="" disabled>
            {monthLabel}
          </option>
          {months.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
        <input
          className={`${inputClass} text-center`}
          inputMode="numeric"
          autoComplete="bday-year"
          placeholder={lang === "en" ? "YYYY" : "RRRR"}
          maxLength={4}
          aria-label={yearLabel}
          value={year}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            setYear(v);
            emit(day, month, v);
          }}
        />
      </div>
    </fieldset>
  );
}
