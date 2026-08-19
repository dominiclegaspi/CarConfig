import { test } from "node:test";
import assert from "node:assert/strict";
import { ruleBasedParse } from "../lib/parse.ts";

test("extracts a 'spend more than X' ceiling as budgetMax, not literally as a minimum", () => {
  const prefs = ruleBasedParse("I don't want to spend more than 25k on this");
  assert.strictEqual(prefs.budgetMax, 25000);
});

test("does not confuse annual mileage with budget", () => {
  const prefs = ruleBasedParse("I drive about 12k miles a year and don't want to spend more than 25k");
  assert.strictEqual(prefs.budgetMax, 25000);
  assert.strictEqual(prefs.annualMileage, "10-15k");
});

test("negated body type becomes a dealbreaker, not a preference", () => {
  const prefs = ruleBasedParse("no trucks please, something sporty");
  assert.ok(!prefs.bodyTypes || !prefs.bodyTypes.includes("pickup-full"));
  assert.ok(prefs.dealbreakers?.includes("truck"));
});

test("positive body type mention is captured as a preference", () => {
  const prefs = ruleBasedParse("I want an SUV, ideally a compact suv");
  assert.ok(prefs.bodyTypes?.includes("suv-compact"));
});

test("extracts ordered priorities by first mention", () => {
  const prefs = ruleBasedParse("I care most about reliability, then fuel economy, and safety matters too");
  assert.deepStrictEqual(prefs.priorities, ["reliability", "fuelEconomy", "safety"]);
});

test("extracts explicit dollar amount", () => {
  const prefs = ruleBasedParse("looking for something around $18,000");
  assert.strictEqual(prefs.budgetMin, 15300);
  assert.strictEqual(prefs.budgetMax, 20700);
});

test("extracts EV preference and city environment", () => {
  const prefs = ruleBasedParse("I live downtown and only want an EV");
  assert.strictEqual(prefs.fuelType, "ev");
  assert.strictEqual(prefs.environment, "city");
});
