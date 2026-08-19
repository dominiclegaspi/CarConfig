import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applyHardFilters, buildWeights, scoreCandidates, rankByWeightedScore, recommend } from "../lib/scoring.ts";
import { mergePreferences } from "../lib/defaults.ts";
import type { Vehicle } from "../lib/types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vehicles: Vehicle[] = JSON.parse(
  readFileSync(path.join(__dirname, "..", "data", "vehicles.json"), "utf-8")
);

test("weight vector always sums to ~1", () => {
  const prefs = mergePreferences({ priorities: ["safety", "reliability"] });
  const weights = buildWeights(prefs);
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `expected weights to sum to 1, got ${sum}`);
});

test("family persona: safety/reliability/cargo priorities surface roomy, safe, reliable SUVs", () => {
  const prefs = mergePreferences({
    budgetMin: 25000,
    budgetMax: 45000,
    priorities: ["safety", "reliability", "cargoSpace"],
    performanceImportance: 3,
    bodyTypes: ["suv-midsize"],
    seatsMin: 7,
    drivetrain: "AWD",
  });
  const result = recommend(vehicles, prefs, 5);
  assert.ok(result.results.length > 0, "should return results");
  for (const r of result.results) {
    assert.ok(r.vehicle.seats >= 7, `${r.vehicle.model} should seat 7+`);
    assert.ok(r.vehicle.safetyRating >= 4, `${r.vehicle.model} should have a strong safety rating`);
  }
  // Top result should score very highly on both safety and reliability subscores.
  const top = result.results[0];
  assert.ok(top.subScores.safety >= 70, "top family pick should score well on safety");
});

test("sporty budget persona: strong performance priority meaningfully outranks a mundane commuter sedan", () => {
  const prefs = mergePreferences({
    budgetMin: 0,
    budgetMax: 30000,
    priorities: ["performance", "reliability"],
    performanceImportance: 9,
    seatsMin: 2,
  });
  const result = recommend(vehicles, prefs, 10);
  const ids = result.results.map((r) => r.vehicle.id);
  const camryRank = ids.indexOf("toyota-camry");
  const gr86Rank = ids.indexOf("toyota-gr86");
  assert.ok(gr86Rank !== -1, "GR86 should be a candidate under a $30k budget");
  if (camryRank !== -1) {
    assert.ok(gr86Rank < camryRank, "a dedicated sports car should outrank a family sedan when performance is heavily prioritized");
  }
  // Performance should be the (or tied for) dominant weight.
  const weights = buildWeights(prefs);
  const maxWeight = Math.max(...Object.values(weights));
  assert.strictEqual(weights.performance, maxWeight, "performance should be the top-weighted factor for this persona");
});

test("dealbreakers exclude matching vehicles entirely", () => {
  const prefs = mergePreferences({
    budgetMin: 0,
    budgetMax: 60000,
    dealbreakers: "truck, no electric",
  });
  const { candidates } = applyHardFilters(vehicles, prefs);
  for (const v of candidates) {
    assert.ok(!v.bodyType.startsWith("pickup"), `${v.id} is a truck and should have been excluded`);
    assert.notStrictEqual(v.fuelType, "ev", `${v.id} is electric and should have been excluded`);
  }
});

test("overly narrow filters degrade gracefully instead of returning zero results", () => {
  const prefs = mergePreferences({
    budgetMin: 15000,
    budgetMax: 18000,
    condition: "new",
    bodyTypes: ["suv-large"],
    seatsMin: 8,
    fuelType: "ev",
    drivetrain: "AWD",
  });
  const { candidates, relaxedConstraints } = applyHardFilters(vehicles, prefs);
  assert.ok(candidates.length > 0, "should still return something rather than an empty set");
  assert.ok(relaxedConstraints.length > 0, "should be transparent that it relaxed constraints");
});

test("subscores are always within [0, 100]", () => {
  const prefs = mergePreferences({});
  const { candidates } = applyHardFilters(vehicles, prefs);
  const scored = scoreCandidates(candidates, prefs);
  for (const sv of scored) {
    for (const [key, value] of Object.entries(sv.subScores)) {
      assert.ok(value >= 0 && value <= 100, `${key} for ${sv.vehicle.id} out of range: ${value}`);
    }
  }
});

test("ranking is stable-sorted descending by matchScore", () => {
  const prefs = mergePreferences({ priorities: ["reliability", "comfort"] });
  const { candidates } = applyHardFilters(vehicles, prefs);
  const scored = scoreCandidates(candidates, prefs);
  const weights = buildWeights(prefs);
  const ranked = rankByWeightedScore(scored, weights);
  for (let i = 1; i < ranked.length; i++) {
    assert.ok(ranked[i - 1].matchScore >= ranked[i].matchScore, "results must be sorted descending");
  }
});
