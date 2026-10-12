export type Sex = "male" | "female";
export type Lifestyle = "sedentary" | "on_feet" | "physical";
export type WorkoutKind = "walk" | "run" | "gym" | "bike" | "football" | "swim" | "other";
export type Effort = "easy" | "sweaty" | "exhausting";
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
  /** Hours slept last night, or null if unknown. */
  sleepHours: number | null;
  /** Whether today's morning check-in is done. Without it the target is provisional. */
  checkedIn: boolean;
  /** Without a watch: calories of today's planned/logged workouts (above resting). */
  workoutKcal: number;
  /**
   * With a watch that synced recently: all active calories measured today.
   * When set, it replaces the lifestyle factor and workouts entirely.
   */
  watchActiveKcal?: number | null;
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
  /** "watch": resting burn + digestion + everything the watch measured. "lifestyle": resting burn × lifestyle + workouts. */
  mode: "watch" | "lifestyle";
  activitySource: "watch" | "workouts" | "none";
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
