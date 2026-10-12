/**
 * Every tunable number in the calorie engine lives here, so behaviour can be
 * adjusted without touching the logic. Values follow SPEC.md §5.
 */
export const ENGINE = {
  /** kcal stored in 1 kg of body fat (common approximation). */
  KCAL_PER_KG: 7700,

  /** Healthy limits used for the recommended pace and for warnings (not hard limits). */
  /** Max weekly loss as a fraction of body weight (1%). */
  MAX_WEEKLY_LOSS_FRACTION: 0.01,
  /** Max daily deficit as a fraction of that day's total burn (25%). */
  MAX_DEFICIT_FRACTION_OF_BURN: 0.25,
  /** Absolute daily deficit cap. */
  MAX_DEFICIT_KCAL: 1000,

  /** Pace presets offered to the user (fraction of body weight per week). "auto" is the recommended one. */
  PACE_PRESETS: [0.005, 0.0075, 0.01, 0.0125, 0.015],
  /** Highest pace the custom slider allows. Only the kcal floor is a hard limit. */
  MAX_CUSTOM_PACE: 0.02,

  /** Hard minimum daily target — the only limit a user can't override. */
  FLOOR_KCAL: { male: 1500, female: 1200 },
  /** BMI at which the deficit stops and the target becomes maintenance. */
  MAINTENANCE_BMI: 20,

  /** Lifestyle multipliers applied to BMR (no exercise included). */
  LIFESTYLE_FACTOR: { sedentary: 1.2, on_feet: 1.35, physical: 1.5 },

  /** Planned exercise, kcal per kg of body weight for the day. */
  ACTIVITY_KCAL_PER_KG: { rest: 0, light: 2.5, moderate: 5, hard: 8 },

  /** Short sleep threshold and how much the deficit shrinks that day. */
  SHORT_SLEEP_HOURS: 6,
  SHORT_SLEEP_DEFICIT_REDUCTION: 0.1,

  /** Overage carry-over: per-day cap as a fraction of the target, and how many days. */
  CARRY_MAX_FRACTION_PER_DAY: 0.1,
  CARRY_MAX_DAYS: 3,

  /** 5:2 low-day targets. */
  LOW_DAY_KCAL: { male: 600, female: 500 },

  /** Water: ml per kg of body weight, plus ml per hour of exercise. */
  WATER_ML_PER_KG: 33,
  WATER_ML_PER_EXERCISE_HOUR: 500,
  /** Rough exercise hours implied by each planned activity level. */
  ACTIVITY_EXERCISE_HOURS: { rest: 0, light: 0.5, moderate: 1, hard: 1.5 },

  /**
   * Watch "active calories" include ordinary walking around, which the lifestyle
   * factor already counts. Only activity above this daily amount adds to the target.
   */
  WATCH_BASELINE_ACTIVE_KCAL: { sedentary: 300, on_feet: 500, physical: 700 },
  /** Fallback when the watch sends steps but no active calories: kcal per step per kg of body weight. */
  KCAL_PER_STEP_PER_KG: 0.0005,
  /** Until this local time the target uses the higher of plan and watch; after it, only what the watch measured. */
  WATCH_SWITCH_TIME: "18:00",

  /** High-protein focus: grams of protein per kg. */
  PROTEIN_G_PER_KG: 1.6,
} as const;
