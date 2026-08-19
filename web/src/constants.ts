import type { PriorityKey } from "./types";

export const PRIORITY_OPTIONS: { key: PriorityKey; label: string; blurb: string }[] = [
  { key: "reliability", label: "Reliability", blurb: "Won't spend your life at the shop" },
  { key: "performance", label: "Performance", blurb: "Quick, fun to drive" },
  { key: "fuelEconomy", label: "Fuel economy", blurb: "Cheap to fill up / charge" },
  { key: "luxury", label: "Luxury", blurb: "Upscale materials & badge" },
  { key: "technology", label: "Technology", blurb: "Screens, driver assist, connectivity" },
  { key: "cargoSpace", label: "Cargo space", blurb: "Room for gear, groceries, gear" },
  { key: "safety", label: "Safety", blurb: "Crash ratings & driver-assist safety" },
  { key: "comfort", label: "Comfort", blurb: "Smooth ride, quiet cabin, roomy seats" },
];

export const BODY_TYPE_OPTIONS: { key: string; label: string }[] = [
  { key: "sedan", label: "Sedan" },
  { key: "hatchback", label: "Hatchback" },
  { key: "suv-compact", label: "Compact SUV" },
  { key: "suv-midsize", label: "Midsize / 3-row SUV" },
  { key: "suv-large", label: "Full-size SUV" },
  { key: "minivan", label: "Minivan" },
  { key: "pickup-compact", label: "Compact/midsize truck" },
  { key: "pickup-full", label: "Full-size truck" },
  { key: "sports-car", label: "Sports car / coupe" },
];

export const MILEAGE_OPTIONS: { key: string; label: string }[] = [
  { key: "<5k", label: "Under 5,000 mi/yr" },
  { key: "5-10k", label: "5,000–10,000 mi/yr" },
  { key: "10-15k", label: "10,000–15,000 mi/yr" },
  { key: "15k+", label: "15,000+ mi/yr" },
];

export const ENVIRONMENT_OPTIONS: { key: string; label: string }[] = [
  { key: "city", label: "City" },
  { key: "suburbs", label: "Suburbs" },
  { key: "rural", label: "Rural" },
  { key: "mixed", label: "Mixed" },
];

export const DRIVETRAIN_OPTIONS: { key: string; label: string }[] = [
  { key: "any", label: "Doesn't matter" },
  { key: "FWD", label: "Front-wheel drive" },
  { key: "RWD", label: "Rear-wheel drive" },
  { key: "AWD", label: "All-wheel drive" },
  { key: "4WD", label: "4-wheel drive" },
];

export const FUEL_OPTIONS: { key: string; label: string }[] = [
  { key: "any", label: "Doesn't matter" },
  { key: "gas", label: "Gas" },
  { key: "hybrid", label: "Hybrid" },
  { key: "ev", label: "Electric" },
];

export const CONDITION_OPTIONS: { key: string; label: string }[] = [
  { key: "either", label: "Either" },
  { key: "new", label: "New" },
  { key: "used", label: "Used" },
];
