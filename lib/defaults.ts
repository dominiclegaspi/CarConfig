import type { Preferences } from "./types.ts";

export const DEFAULT_PREFERENCES: Preferences = {
  budgetMin: 0,
  budgetMax: 40000,
  condition: "either",
  priorities: ["reliability"],
  performanceImportance: 5,
  annualMileage: "10-15k",
  environment: "mixed",
  drivetrain: "any",
  bodyTypes: [],
  seatsMin: 4,
  fuelType: "any",
  dealbreakers: "",
  zip: "",
  radiusMiles: 50,
};

export function mergePreferences(partial: Partial<Preferences>): Preferences {
  return { ...DEFAULT_PREFERENCES, ...partial };
}
