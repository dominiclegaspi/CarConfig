// Explicit seed script. In practice the database auto-seeds itself the
// first time the server starts (see lib/db.ts getDb()), but having
// a standalone command is useful for CI, tests, or resetting the DB.
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAllVehicles } from "../lib/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "data", "carfinder.db");

if (process.argv.includes("--reset") && existsSync(dbPath)) {
  unlinkSync(dbPath);
  console.log("[seed] removed existing database");
}

const vehicles = await getAllVehicles();
console.log(`[seed] database ready with ${vehicles.length} vehicles at ${dbPath}`);
