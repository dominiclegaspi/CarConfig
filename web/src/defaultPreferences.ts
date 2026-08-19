import type { Preferences } from "./types";

export const DEFAULT_PREFERENCES: Preferences = {
  budgetMin: 20000,
  budgetMax: 40000,
  condition: "either",
  priorities: [],
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
