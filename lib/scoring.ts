// ---------------------------------------------------------------------------
// The recommendation engine.
//
// Pipeline:  preferences -> hard filters -> candidate set -> percentile
//            feature normalization -> weighted scoring + vector-similarity
//            re-rank -> explanations
//
// Deliberately dependency-free and deterministic so it is easy to reason
// about, unit test, and explain in an interview. No LLM is involved in this
// file at all — the "AI" in the product lives one layer up, in parse.ts,
// converting fuzzy human language into the structured Preferences object
// this engine consumes. This file is where the actual ranking math happens.
// ---------------------------------------------------------------------------

import type {
  Vehicle,
  Preferences,
  SubScores,
  ScoredVehicle,
  RecommendResponse,
  OwnershipEstimate,
  PriorityKey,
} from "./types.js";

const SUBSCORE_KEYS: (keyof SubScores)[] = [
  "performance",
  "reliability",
  "efficiency",
  "cargoSpace",
  "safety",
  "technology",
  "comfort",
  "luxury",
  "value",
];

// Maps the user-facing priority checklist to the internal subscore(s) it
// should weight. A couple of priorities intentionally fan out to more than
// one subscore (e.g. "cargo space" cares about both cargo volume and seats).
const PRIORITY_TO_SUBSCORES: Record<PriorityKey, (keyof SubScores)[]> = {
  reliability: ["reliability"],
  performance: ["performance"],
  fuelEconomy: ["efficiency"],
  luxury: ["luxury", "comfort"],
  technology: ["technology"],
  cargoSpace: ["cargoSpace"],
  safety: ["safety"],
  comfort: ["comfort"],
};

const SEGMENT_RANK: Record<Vehicle["segment"], number> = {
  economy: 1,
  mainstream: 2,
  premium: 3,
  luxury: 4,
};

const ANNUAL_MILEAGE_MIDPOINT: Record<Preferences["annualMileage"], number> = {
  "<5k": 4000,
  "5-10k": 7500,
  "10-15k": 12500,
  "15k+": 18000,
};

// Rough, clearly-labeled-as-estimated constants used for the ownership-cost
// projection. These are intentionally simple (no live fuel-price API) — the
// goal is a *relative* ranking signal between candidates, not a quoted price.
const ASSUMED_GAS_PRICE_PER_GAL = 3.5;
const ASSUMED_ELECTRICITY_PRICE_PER_KWH = 0.16;
const ASSUMED_EV_EFFICIENCY_MI_PER_KWH = 3.3;
const MAINTENANCE_BY_SEGMENT: Record<Vehicle["segment"], number> = {
  economy: 600,
  mainstream: 800,
  premium: 1200,
  luxury: 1800,
};
const INSURANCE_BASE_BY_SEGMENT: Record<Vehicle["segment"], number> = {
  economy: 1100,
  mainstream: 1300,
  premium: 1700,
  luxury: 2400,
};

export interface HardFilterResult {
  candidates: Vehicle[];
  relaxedConstraints: string[];
}

/**
 * Step 1: narrow the full catalog down to plausible candidates.
 * Uses a "relax progressively" strategy so an overly-narrow query (e.g. a
 * $18k budget + 8 seats + AWD) degrades gracefully to *something* useful
 * instead of an empty result set, while being transparent about what it
 * relaxed.
 */
export function applyHardFilters(all: Vehicle[], prefs: Preferences): HardFilterResult {
  const relaxedConstraints: string[] = [];

  const passesBudget = (v: Vehicle, tolerance: number) =>
    v.priceMin <= prefs.budgetMax * (1 + tolerance) &&
    v.priceMax >= prefs.budgetMin * (1 - tolerance);

  const passesSeats = (v: Vehicle) => v.seats >= prefs.seatsMin;

  const passesBodyType = (v: Vehicle) =>
    prefs.bodyTypes.length === 0 ||
    prefs.bodyTypes.includes("any") ||
    prefs.bodyTypes.includes(v.bodyType);

  const passesDrivetrain = (v: Vehicle) =>
    prefs.drivetrain === "any" ||
    v.drivetrain === prefs.drivetrain ||
    (prefs.drivetrain === "AWD" && v.awdAvailable);

  const passesFuel = (v: Vehicle) => prefs.fuelType === "any" || v.fuelType === prefs.fuelType;

  const dealbreakerTokens = extractDealbreakerTokens(prefs.dealbreakers);
  const passesDealbreakers = (v: Vehicle) => {
    const haystack = `${v.make} ${v.model} ${v.bodyType} ${v.fuelType} ${v.segment} ${bodyTypeSynonyms(
      v.bodyType
    )} ${fuelTypeSynonyms(v.fuelType)}`.toLowerCase();
    return !dealbreakerTokens.some((tok) => haystack.includes(tok));
  };

  // Attempt 1: all constraints, tight budget tolerance.
  let tolerance = 0.05;
  let candidates = all.filter(
    (v) =>
      passesBudget(v, tolerance) &&
      passesSeats(v) &&
      passesBodyType(v) &&
      passesDrivetrain(v) &&
      passesFuel(v) &&
      passesDealbreakers(v)
  );

  if (candidates.length >= 5) return { candidates, relaxedConstraints };

  // Attempt 2: widen budget tolerance.
  tolerance = 0.2;
  candidates = all.filter(
    (v) =>
      passesBudget(v, tolerance) &&
      passesSeats(v) &&
      passesBodyType(v) &&
      passesDrivetrain(v) &&
      passesFuel(v) &&
      passesDealbreakers(v)
  );
  if (candidates.length >= 5) {
    relaxedConstraints.push("Widened your budget range slightly to surface more options.");
    return { candidates, relaxedConstraints };
  }

  // Attempt 3: drop drivetrain + fuel constraints (keep body type/seats/budget).
  candidates = all.filter(
    (v) => passesBudget(v, tolerance) && passesSeats(v) && passesBodyType(v) && passesDealbreakers(v)
  );
  if (candidates.length >= 5) {
    relaxedConstraints.push(
      "Relaxed drivetrain/fuel-type filters because they were too restrictive combined with your other answers."
    );
    return { candidates, relaxedConstraints };
  }

  // Attempt 4: drop body type too.
  candidates = all.filter((v) => passesBudget(v, tolerance) && passesSeats(v) && passesDealbreakers(v));
  if (candidates.length >= 5) {
    relaxedConstraints.push("Relaxed body-type filter to avoid an empty result set.");
    return { candidates, relaxedConstraints };
  }

  // Attempt 5: budget only, generous tolerance.
  tolerance = 0.35;
  candidates = all.filter((v) => passesBudget(v, tolerance) && passesDealbreakers(v));
  relaxedConstraints.push(
    "Your combination of filters was very narrow, so we widened almost everything except budget and your dealbreakers."
  );
  if (candidates.length > 0) return { candidates, relaxedConstraints };

  // Last resort: just exclude dealbreakers.
  relaxedConstraints.push("Even budget was relaxed — showing closest matches by price.");
  return { candidates: all.filter(passesDealbreakers), relaxedConstraints };
}

/** Plain-English synonyms for our internal bodyType codes, so a dealbreaker
 * like "no trucks" matches vehicles whose bodyType is "pickup-full". */
function bodyTypeSynonyms(bodyType: string): string {
  if (bodyType.startsWith("pickup")) return "truck pickup";
  if (bodyType.startsWith("suv")) return "suv crossover";
  if (bodyType === "minivan") return "van minivan";
  if (bodyType === "sports-car") return "sports car coupe convertible";
  if (bodyType === "hatchback") return "hatchback hatch";
  return "";
}

function fuelTypeSynonyms(fuelType: string): string {
  if (fuelType === "ev") return "electric ev";
  if (fuelType === "gas") return "gasoline gas";
  return "";
}

function extractDealbreakerTokens(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const knownTokens = [
    "truck", "pickup", "suv", "sedan", "minivan", "van", "hatchback", "coupe",
    "convertible", "wagon", "ev", "electric", "hybrid", "gas", "diesel",
    "manual", "stick shift", "white", "black", "red",
    // makes
    "toyota", "honda", "ford", "chevrolet", "chevy", "gmc", "ram", "jeep",
    "dodge", "chrysler", "nissan", "hyundai", "kia", "mazda", "subaru",
    "volkswagen", "vw", "bmw", "mercedes", "audi", "lexus", "acura",
    "genesis", "tesla", "rivian", "polestar", "cadillac", "buick",
    "land rover", "porsche", "mitsubishi", "mini",
  ];
  return knownTokens.filter((tok) => lower.includes(tok));
}

/** Min-max normalize a numeric field across the candidate set to 0-100. */
function percentileNormalize(values: number[], value: number, invert = false): number {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max - min < 1e-9) return 75; // all candidates tied on this metric — neutral-high score
  let pct = ((value - min) / (max - min)) * 100;
  if (invert) pct = 100 - pct;
  return clamp(pct, 0, 100);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function estimateOwnership(v: Vehicle, prefs: Preferences): OwnershipEstimate {
  const milesPerYear = ANNUAL_MILEAGE_MIDPOINT[prefs.annualMileage];
  let estFuelCostPerYear: number;
  if (v.fuelType === "ev") {
    const kwhPerYear = milesPerYear / ASSUMED_EV_EFFICIENCY_MI_PER_KWH;
    estFuelCostPerYear = kwhPerYear * ASSUMED_ELECTRICITY_PRICE_PER_KWH;
  } else {
    const mpg = v.mpgCombined ?? 25;
    const gallonsPerYear = milesPerYear / mpg;
    estFuelCostPerYear = gallonsPerYear * ASSUMED_GAS_PRICE_PER_GAL;
  }
  const estMaintenancePerYear = MAINTENANCE_BY_SEGMENT[v.segment];
  // Sportier / lower-reliability cars nudge insurance & maintenance up a bit.
  const performanceSurcharge = v.zeroToSixty < 6 ? 1.15 : 1;
  const reliabilityDiscount = 1 + (5 - v.reliabilityScore) * 0.05;
  const estInsurancePerYear =
    INSURANCE_BASE_BY_SEGMENT[v.segment] * performanceSurcharge * reliabilityDiscount;

  return {
    estFuelCostPerYear: Math.round(estFuelCostPerYear),
    estMaintenancePerYear: Math.round(estMaintenancePerYear * reliabilityDiscount),
    estInsurancePerYear: Math.round(estInsurancePerYear),
    estTotalPerYear: Math.round(
      estFuelCostPerYear + estMaintenancePerYear * reliabilityDiscount + estInsurancePerYear
    ),
  };
}

/**
 * Step 2: compute 0-100 subscores for every candidate, normalized *within
 * the candidate set* (percentile-style, matching the approach used for the
 * NBA player-similarity project) rather than against a fixed global scale.
 * This means "efficiency" among a set of trucks is judged against other
 * trucks, not against a Prius — which keeps comparisons meaningful.
 */
export function scoreCandidates(candidates: Vehicle[], prefs: Preferences): ScoredVehicle[] {
  if (candidates.length === 0) return [];

  const hp = candidates.map((v) => v.horsepower);
  const zeroToSixty = candidates.map((v) => v.zeroToSixty);
  const cargo = candidates.map((v) => v.cargoCuFt);
  const seats = candidates.map((v) => v.seats);
  const tech = candidates.map((v) => v.techScore);
  const comfort = candidates.map((v) => v.comfortScore);
  const reliability = candidates.map((v) => v.reliabilityScore);
  const safety = candidates.map((v) => v.safetyRating);
  const segmentRank = candidates.map((v) => SEGMENT_RANK[v.segment]);
  const avgPrice = candidates.map((v) => (v.priceMin + v.priceMax) / 2);

  // "Efficiency" is fuel-cost-per-mile so gas, hybrid, and EV compare fairly.
  const efficiency = candidates.map((v) => {
    if (v.fuelType === "ev") return ASSUMED_ELECTRICITY_PRICE_PER_KWH / ASSUMED_EV_EFFICIENCY_MI_PER_KWH;
    const mpg = v.mpgCombined ?? 25;
    return ASSUMED_GAS_PRICE_PER_GAL / mpg;
  });

  const ownershipEstimates = candidates.map((v) => estimateOwnership(v, prefs));
  const totalOwnership = ownershipEstimates.map((o) => o.estTotalPerYear);

  // "Raw quality" used as the numerator of the value ratio: an unweighted
  // blend of the specs that matter regardless of user priorities.
  const rawQuality = candidates.map((v, i) => {
    const perf = percentileNormalize(hp, hp[i]) * 0.5 + percentileNormalize(zeroToSixty, zeroToSixty[i], true) * 0.5;
    const rel = percentileNormalize(reliability, reliability[i]);
    const saf = percentileNormalize(safety, safety[i]);
    const cmf = percentileNormalize(comfort, comfort[i]);
    return (perf + rel + saf + cmf) / 4;
  });

  const scored: ScoredVehicle[] = candidates.map((v, i) => {
    const performance =
      percentileNormalize(hp, hp[i]) * 0.45 + percentileNormalize(zeroToSixty, zeroToSixty[i], true) * 0.55;
    const cargoSpace = percentileNormalize(cargo, cargo[i]) * 0.6 + percentileNormalize(seats, seats[i]) * 0.4;
    const luxury = percentileNormalize(segmentRank, segmentRank[i]);
    const reliabilityScore = percentileNormalize(reliability, reliability[i]);
    const safetyScore = percentileNormalize(safety, safety[i]);
    const technology = percentileNormalize(tech, tech[i]);
    const comfortScore = percentileNormalize(comfort, comfort[i]);
    const efficiencyScore = percentileNormalize(efficiency, efficiency[i], true);
    const value =
      percentileNormalize(
        rawQuality.map((q, j) => q / Math.max(avgPrice[j], 1)),
        rawQuality[i] / Math.max(avgPrice[i], 1)
      ) * 0.7 + percentileNormalize(totalOwnership, totalOwnership[i], true) * 0.3;

    const subScores: SubScores = {
      performance: round1(performance),
      reliability: round1(reliabilityScore),
      efficiency: round1(efficiencyScore),
      cargoSpace: round1(cargoSpace),
      safety: round1(safetyScore),
      technology: round1(technology),
      comfort: round1(comfortScore),
      luxury: round1(luxury),
      value: round1(value),
    };

    return {
      vehicle: v,
      matchScore: 0, // filled in by rankByWeightedScore
      subScores,
      weightedContributions: {},
      ownership: ownershipEstimates[i],
      reasons: [],
      tradeoffs: [],
      hardFilterNotes: [],
    };
  });

  return scored;
}

/** Builds the weight vector from priorities + performance slider. */
export function buildWeights(prefs: Preferences): Record<keyof SubScores, number> {
  // Baselines are kept deliberately small relative to the priority bonuses
  // below. Every candidate has already passed the hard filters, so these
  // are just gentle tie-breaking signals — the point of asking "what
  // matters most to you" is that it should visibly steer the ranking, not
  // get diluted by eight other factors the user never mentioned.
  const weights: Record<keyof SubScores, number> = {
    performance: 0.15,
    reliability: 0.2,
    efficiency: 0.15,
    cargoSpace: 0.15,
    safety: 0.2,
    technology: 0.1,
    comfort: 0.15,
    luxury: 0.08,
    value: 0.25, // almost everyone cares about value at least a little
  };

  // Selected priorities get a strong descending bonus by rank order, so the
  // #1 thing a user says they care about actually dominates the ranking.
  prefs.priorities.forEach((p, rank) => {
    const bonus = Math.max(3.2 - rank * 0.5, 1); // 3.2, 2.7, 2.2, ... floor 1.0
    for (const key of PRIORITY_TO_SUBSCORES[p] ?? []) {
      weights[key] += bonus;
    }
  });

  // Performance importance slider (1-10) directly scales performance weight.
  weights.performance *= 0.4 + prefs.performanceImportance / 10;

  // Higher annual mileage -> efficiency and value matter more (fuel costs add up).
  const mileageBoost: Record<Preferences["annualMileage"], number> = {
    "<5k": 1,
    "5-10k": 1.1,
    "10-15k": 1.25,
    "15k+": 1.45,
  };
  weights.efficiency *= mileageBoost[prefs.annualMileage];
  weights.value *= 1 + (mileageBoost[prefs.annualMileage] - 1) * 0.5;

  // Environment nudges: rural -> practicality/safety, city -> nothing extra
  // (kept subtle; hard hard-filtering on body type already does the heavy lifting).
  if (prefs.environment === "rural") {
    weights.cargoSpace *= 1.15;
    weights.safety *= 1.1;
  }

  const sum = SUBSCORE_KEYS.reduce((s, k) => s + weights[k], 0);
  for (const k of SUBSCORE_KEYS) weights[k] = weights[k] / sum;
  return weights;
}

function dotProduct(a: number[], b: number[]) {
  return a.reduce((s, v, i) => s + v * b[i], 0);
}
function magnitude(a: number[]) {
  return Math.sqrt(a.reduce((s, v) => s + v * v, 0));
}
function cosineSimilarity(a: number[], b: number[]) {
  const denom = magnitude(a) * magnitude(b);
  if (denom < 1e-9) return 0;
  return dotProduct(a, b) / denom;
}

/**
 * Step 3: combine subscores with the weight vector two ways and blend them:
 *   (a) a straightforward weighted sum (classic multi-criteria scoring)
 *   (b) cosine similarity between the user's weight vector and each
 *       candidate's subscore vector (a content-based-filtering / vector
 *       similarity technique — rewards cars whose overall *shape* of
 *       strengths matches what the user says they care about, not just
 *       raw magnitude).
 * 85/15 blend: (a) does the primary ranking work, (b) is a tie-breaking
 * nudge toward well-rounded fits for the user's specific priority shape.
 */
export function rankByWeightedScore(
  scored: ScoredVehicle[],
  weights: Record<keyof SubScores, number>
): ScoredVehicle[] {
  const weightVec = SUBSCORE_KEYS.map((k) => weights[k]);

  for (const sv of scored) {
    const subVec = SUBSCORE_KEYS.map((k) => sv.subScores[k]);
    const weightedSum = SUBSCORE_KEYS.reduce((s, k) => s + sv.subScores[k] * weights[k], 0);
    const similarity = cosineSimilarity(weightVec, subVec); // 0..1-ish
    sv.matchScore = round1(clamp(weightedSum * 0.85 + similarity * 100 * 0.15, 0, 100));

    const contributions: Partial<Record<keyof SubScores, number>> = {};
    for (const k of SUBSCORE_KEYS) {
      contributions[k] = round1(sv.subScores[k] * weights[k]);
    }
    sv.weightedContributions = contributions;
  }

  return scored.sort((a, b) => b.matchScore - a.matchScore);
}

const SUBSCORE_LABELS: Record<keyof SubScores, string> = {
  performance: "Performance",
  reliability: "Reliability",
  efficiency: "Fuel/energy efficiency",
  cargoSpace: "Cargo & passenger space",
  safety: "Safety",
  technology: "Technology",
  comfort: "Comfort",
  luxury: "Luxury/prestige",
  value: "Value for money",
};

/** Step 4: generate the human-readable "why this fits" / tradeoffs bullets. */
export function explain(sv: ScoredVehicle, prefs: Preferences, weights: Record<keyof SubScores, number>) {
  const byContribution = SUBSCORE_KEYS.slice().sort(
    (a, b) => (sv.weightedContributions[b] ?? 0) - (sv.weightedContributions[a] ?? 0)
  );

  const reasons: string[] = [];
  const v = sv.vehicle;
  const midPrice = Math.round((v.priceMin + v.priceMax) / 2);
  if (v.priceMin <= prefs.budgetMax && v.priceMax >= prefs.budgetMin) {
    reasons.push(`Fits your $${prefs.budgetMin.toLocaleString()}–$${prefs.budgetMax.toLocaleString()} budget (est. $${midPrice.toLocaleString()}).`);
  } else {
    reasons.push(`Slightly outside your stated budget (est. $${midPrice.toLocaleString()}), but strong enough elsewhere to surface anyway.`);
  }
  if (prefs.drivetrain === "AWD" && (v.drivetrain === "AWD" || v.drivetrain === "4WD" || v.awdAvailable)) {
    reasons.push("AWD available, matching your drivetrain preference.");
  }
  for (const key of byContribution.slice(0, 3)) {
    if (weights[key] < 0.03) continue; // don't cite factors the user didn't weight
    reasons.push(`${SUBSCORE_LABELS[key]}: scores ${sv.subScores[key]}/100 among your candidates.`);
  }

  const tradeoffs: string[] = [];
  const worst = byContribution[byContribution.length - 1];
  if (sv.subScores[worst] < 55) {
    tradeoffs.push(`${SUBSCORE_LABELS[worst]} is comparatively weak (${sv.subScores[worst]}/100) versus other matches.`);
  }
  if (v.priceMax > prefs.budgetMax) {
    tradeoffs.push(`Top trims can run above your budget ceiling (up to $${v.priceMax.toLocaleString()}).`);
  }

  sv.reasons = reasons.slice(0, 4);
  sv.tradeoffs = tradeoffs.slice(0, 2);
}

export function recommend(all: Vehicle[], prefs: Preferences, topN = 8): RecommendResponse {
  const { candidates, relaxedConstraints } = applyHardFilters(all, prefs);
  const scored = scoreCandidates(candidates, prefs);
  const weights = buildWeights(prefs);
  const ranked = rankByWeightedScore(scored, weights);
  const top = ranked.slice(0, topN);
  for (const sv of top) explain(sv, prefs, weights);

  return {
    candidatesConsidered: candidates.length,
    relaxedConstraints,
    weights,
    results: top,
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
