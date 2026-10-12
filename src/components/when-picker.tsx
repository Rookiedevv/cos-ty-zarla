"use client";

import { useT } from "@/lib/i18n/client";
import { ChoiceGroup, inputClass } from "./ui";

export type When = "now" | "m30" | "h1" | "h2" | "h3" | "custom";
export interface WhenValue {
  when: When;
  customDate: string;
  customTime: string;
}

export const whenReady = (v: WhenValue) => v.when !== "custom" || Boolean(v.customTime);

export const whenPayload = (v: WhenValue) => ({
  when: v.when,
  custom_date: v.when === "custom" ? v.customDate : undefined,
  custom_time: v.when === "custom" ? v.customTime : undefined,
});

/** "When did you eat it?" — quick picks, or an exact date and time. */
export function WhenPicker({ value, onChange, today }: { value: WhenValue; onChange: (v: WhenValue) => void; today: string }) {
  const t = useT();
  return (
    <div className="space-y-3">
      <ChoiceGroup<When>
        name="when"
        legend={t.log.whenQ}
        value={value.when}
        onChange={(when) => onChange({ ...value, when })}
        choices={(["now", "m30", "h1", "h2", "h3", "custom"] as const).map((w) => ({ value: w, label: t.log.when[w] }))}
      />
      {value.when === "custom" && (
        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
          <input
            type="date"
            className={inputClass}
            value={value.customDate}
            max={today}
            onChange={(e) => onChange({ ...value, customDate: e.target.value })}
            aria-label={t.log.when.custom}
          />
          <input
            type="time"
            className={inputClass}
            value={value.customTime}
            onChange={(e) => onChange({ ...value, customTime: e.target.value })}
            aria-label={t.log.when.custom}
            required
          />
        </div>
      )}
    </div>
  );
}
