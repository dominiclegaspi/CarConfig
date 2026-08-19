// Re-exported from the server so the frontend and backend never drift out
// of sync on shape. This is a type-only import — esbuild strips it
// entirely from the browser bundle, so no server/Node code ships to the
// client.
export type {
  Vehicle,
  Preferences,
  PriorityKey,
  SubScores,
  ScoredVehicle,
  RecommendResponse,
  OwnershipEstimate,
  Condition,
  Drivetrain,
  FuelType,
} from "../../lib/types.ts";
