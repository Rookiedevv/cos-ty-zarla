export type Sex = "male" | "female";
export type Lifestyle = "sedentary" | "on_feet" | "physical";
export type PlannedActivity = "rest" | "light" | "moderate" | "hard";
export type Method = "none" | "if" | "five_two" | "montignac";
export type FoodFocus =
  | "balanced"
  | "low_carb"
  | "mediterranean"
  | "high_protein"
  | "vegetarian";

export interface BodyProfile {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  lifestyle: Lifestyle;
  /** Learned multiplier on total burn from weekly weigh-ins (Phase 4). 1 = no correction. */
  burnAdjust?: number;
  /**
   * Chosen weekly loss as a fraction of body weight (0.0075 = 0.75%/week),
   * or "auto" for the recommended pace: the fastest that stays within all healthy limits.
   */
  pace: number | "auto";
}

export interface DayInput {
  /** Hours slept last night, or null if unknown (no check-in yet). */
  sleepHours: number | null;
  /** Planned activity from the check-in, or null when no check-in yet. */
  plannedActivity: PlannedActivity | null;
  /** Actual active kcal from a watch, when available (Phase 5). Replaces planned when present. */
  actualActiveKcal?: number | null;
  /** True when this is a 5:2 low day. */
  isLowDay?: boolean;
}

export interface HistoryDay {
  date: string; // YYYY-MM-DD
  /** Target before carry-over was applied that day. */
  preCarryTarget: number;
  /** Final target that day (after carry-over). */
  finalTarget: number;
  eaten: number;
  isLowDay?: boolean;
}

export interface TargetBreakdown {
  bmr: number;
  baseBurn: number;
  activityKcal: number;
  activitySource: "planned" | "watch" | "assumed_rest";
  totalBurn: number;
  deficit: number;
  /** The recommended (max healthy) weekly pace for this person today, as a fraction of body weight. */
  recommendedPace: number;
  /** The pace actually used (after the floor), as a fraction of body weight per week. */
  effectivePace: number;
  /** Expected kg lost per week if every day looked like today. */
  expectedKgPerWeek: number;
  /** Health warnings the user should see. Empty when within all healthy limits. */
  warnings: ("above_1_percent" | "above_25_percent_of_burn" | "above_1000_kcal" | "at_floor")[];
  sleepAdjusted: boolean;
  floor: number;
  preCarryTarget: number;
  carryOver: number;
  target: number;
  maintenance: boolean;
  provisional: boolean;
  bmi: number;
}
