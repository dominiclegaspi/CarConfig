// Shared type definitions for the car-finder recommendation engine.
// Kept dependency-free (no zod/etc.) so the project has zero required
// runtime npm packages beyond `tsx` for running TypeScript directly.

export type FuelType = "gas" | "hybrid" | "ev";
export type Drivetrain = "FWD" | "RWD" | "AWD" | "4WD";
export type Condition = "new" | "used" | "either";

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  bodyType: string;
  segment: "economy" | "mainstream" | "premium" | "luxury";
  priceMin: number;
  priceMax: number;
  seats: number;
  cargoCuFt: number;
  mpgCity: number | null;
  mpgHwy: number | null;
  mpgCombined: number | null;
  fuelType: FuelType;
  evRangeMi: number | null;
  drivetrain: Drivetrain;
  awdAvailable: boolean;
  zeroToSixty: number;
  horsepower: number;
  towingLbs: number;
  groundClearanceIn: number;
  offroad: boolean;
  safetyRating: number; // 1-5
  reliabilityScore: number; // 1-5
  techScore: number; // 1-5
  comfortScore: number; // 1-5
  features: string[];
  useCases: string[];
  officialSite: string;
  notes: string;
}

/** The priority categories a user can rank/select in the questionnaire. */
export type PriorityKey =
  | "reliability"
  | "performance"
  | "fuelEconomy"
  | "luxury"
  | "technology"
  | "cargoSpace"
  | "safety"
  | "comfort";

export interface Preferences {
  budgetMin: number;
  budgetMax: number;
  condition: Condition;
  /** Ordered most-important-first. */
  priorities: PriorityKey[];
  /** 1-10 slider, independent boost on top of the performance priority weight. */
  performanceImportance: number;
  annualMileage: "<5k" | "5-10k" | "10-15k" | "15k+";
  environment: "city" | "suburbs" | "rural" | "mixed";
  drivetrain: Drivetrain | "any";
  bodyTypes: string[]; // empty/["any"] = no constraint
  seatsMin: number;
  fuelType: FuelType | "any";
  dealbreakers: string; // free text, parsed into exclusion rules
  zip: string;
  radiusMiles: number;
}

export interface SubScores {
  performance: number;
  reliability: number;
  efficiency: number;
  cargoSpace: number;
  safety: number;
  technology: number;
  comfort: number;
  luxury: number;
  value: number;
}

export interface OwnershipEstimate {
  estFuelCostPerYear: number;
  estMaintenancePerYear: number;
  estInsurancePerYear: number;
  estTotalPerYear: number;
}

export interface ScoredVehicle {
  vehicle: Vehicle;
  matchScore: number; // 0-100
  subScores: SubScores;
  weightedContributions: Partial<Record<keyof SubScores, number>>;
  ownership: OwnershipEstimate;
  reasons: string[]; // "why this fits"
  tradeoffs: string[]; // "where it falls short"
  hardFilterNotes: string[];
}

export interface RecommendResponse {
  candidatesConsidered: number;
  relaxedConstraints: string[];
  weights: Record<keyof SubScores, number>;
  results: ScoredVehicle[];
}
