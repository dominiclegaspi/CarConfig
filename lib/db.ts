// Data layer. Two backends, chosen automatically:
//
//   1. node:sqlite (built into Node 22.5+, zero install) — used for local
//      dev (`npm start`/`npm run dev`), giving a real relational schema you
//      can inspect and query (see the CREATE TABLE statements below).
//   2. A plain in-memory read of data/vehicles.json — used automatically
//      on Vercel (or any environment where node:sqlite isn't available/
//      writable), since serverless functions get a read-only filesystem
//      and ephemeral instances where a persisted .db file doesn't make
//      sense anyway. Vercel sets `VERCEL=1` in the function environment,
//      which is what triggers this path.
//
// getAllVehicles() is the only thing the rest of the app calls — callers
// never need to know which backend served the data.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Vehicle } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "data", "carfinder.db");
const SEED_PATH = path.join(__dirname, "..", "data", "vehicles.json");

const FORCE_JSON_FALLBACK = !!process.env.VERCEL;

let cachedVehicles: Vehicle[] | null = null;

function loadFromJson(): Vehicle[] {
  return JSON.parse(readFileSync(SEED_PATH, "utf-8")) as Vehicle[];
}

// ---------------------------------------------------------------------------
// SQLite backend
// ---------------------------------------------------------------------------

type SqliteModule = typeof import("node:sqlite");

async function loadSqliteModule(): Promise<SqliteModule | null> {
  if (FORCE_JSON_FALLBACK) return null;
  try {
    return await import("node:sqlite");
  } catch {
    return null; // runtime doesn't support node:sqlite — fall back to JSON below
  }
}

let db: InstanceType<SqliteModule["DatabaseSync"]> | null = null;

async function getSqliteVehicles(): Promise<Vehicle[] | null> {
  const sqlite = await loadSqliteModule();
  if (!sqlite) return null;

  try {
    if (!db) {
      const needsSeed = !existsSync(DB_PATH);
      db = new sqlite.DatabaseSync(DB_PATH);
      db.exec(`
        CREATE TABLE IF NOT EXISTS vehicles (
          id TEXT PRIMARY KEY,
          make TEXT NOT NULL,
          model TEXT NOT NULL,
          year INTEGER NOT NULL,
          bodyType TEXT NOT NULL,
          segment TEXT NOT NULL,
          priceMin INTEGER NOT NULL,
          priceMax INTEGER NOT NULL,
          seats INTEGER NOT NULL,
          cargoCuFt REAL NOT NULL,
          mpgCity REAL,
          mpgHwy REAL,
          mpgCombined REAL,
          fuelType TEXT NOT NULL,
          evRangeMi REAL,
          drivetrain TEXT NOT NULL,
          awdAvailable INTEGER NOT NULL,
          zeroToSixty REAL NOT NULL,
          horsepower REAL NOT NULL,
          towingLbs REAL NOT NULL,
          groundClearanceIn REAL NOT NULL,
          offroad INTEGER NOT NULL,
          safetyRating REAL NOT NULL,
          reliabilityScore REAL NOT NULL,
          techScore REAL NOT NULL,
          comfortScore REAL NOT NULL,
          officialSite TEXT,
          notes TEXT
        );
        CREATE TABLE IF NOT EXISTS vehicle_features (
          vehicleId TEXT NOT NULL REFERENCES vehicles(id),
          feature TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS vehicle_use_cases (
          vehicleId TEXT NOT NULL REFERENCES vehicles(id),
          useCase TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_features_vehicle ON vehicle_features(vehicleId);
        CREATE INDEX IF NOT EXISTS idx_usecases_vehicle ON vehicle_use_cases(vehicleId);
      `);
      if (needsSeed) seed(db, sqlite);
    }

    const rows = db.prepare(`SELECT * FROM vehicles`).all() as Record<string, unknown>[];
    const featureRows = db
      .prepare(`SELECT vehicleId, feature FROM vehicle_features`)
      .all() as { vehicleId: string; feature: string }[];
    const useCaseRows = db
      .prepare(`SELECT vehicleId, useCase FROM vehicle_use_cases`)
      .all() as { vehicleId: string; useCase: string }[];

    const featuresByVehicle = new Map<string, string[]>();
    for (const r of featureRows) {
      if (!featuresByVehicle.has(r.vehicleId)) featuresByVehicle.set(r.vehicleId, []);
      featuresByVehicle.get(r.vehicleId)!.push(r.feature);
    }
    const useCasesByVehicle = new Map<string, string[]>();
    for (const r of useCaseRows) {
      if (!useCasesByVehicle.has(r.vehicleId)) useCasesByVehicle.set(r.vehicleId, []);
      useCasesByVehicle.get(r.vehicleId)!.push(r.useCase);
    }

    return rows.map((r) => ({
      id: r.id as string,
      make: r.make as string,
      model: r.model as string,
      year: r.year as number,
      bodyType: r.bodyType as string,
      segment: r.segment as Vehicle["segment"],
      priceMin: r.priceMin as number,
      priceMax: r.priceMax as number,
      seats: r.seats as number,
      cargoCuFt: r.cargoCuFt as number,
      mpgCity: r.mpgCity as number | null,
      mpgHwy: r.mpgHwy as number | null,
      mpgCombined: r.mpgCombined as number | null,
      fuelType: r.fuelType as Vehicle["fuelType"],
      evRangeMi: r.evRangeMi as number | null,
      drivetrain: r.drivetrain as Vehicle["drivetrain"],
      awdAvailable: !!r.awdAvailable,
      zeroToSixty: r.zeroToSixty as number,
      horsepower: r.horsepower as number,
      towingLbs: r.towingLbs as number,
      groundClearanceIn: r.groundClearanceIn as number,
      offroad: !!r.offroad,
      safetyRating: r.safetyRating as number,
      reliabilityScore: r.reliabilityScore as number,
      techScore: r.techScore as number,
      comfortScore: r.comfortScore as number,
      features: featuresByVehicle.get(r.id as string) ?? [],
      useCases: useCasesByVehicle.get(r.id as string) ?? [],
      officialSite: (r.officialSite as string) ?? "",
      notes: (r.notes as string) ?? "",
    }));
  } catch (err) {
    console.warn("[db] node:sqlite backend failed, falling back to JSON:", (err as Error).message);
    db = null;
    return null;
  }
}

function seed(database: InstanceType<SqliteModule["DatabaseSync"]>, sqlite: SqliteModule) {
  const raw = loadFromJson();
  const insertVehicle = database.prepare(`
    INSERT INTO vehicles (id, make, model, year, bodyType, segment, priceMin, priceMax,
      seats, cargoCuFt, mpgCity, mpgHwy, mpgCombined, fuelType, evRangeMi, drivetrain,
      awdAvailable, zeroToSixty, horsepower, towingLbs, groundClearanceIn, offroad,
      safetyRating, reliabilityScore, techScore, comfortScore, officialSite, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const insertFeature = database.prepare(`INSERT INTO vehicle_features (vehicleId, feature) VALUES (?, ?)`);
  const insertUseCase = database.prepare(`INSERT INTO vehicle_use_cases (vehicleId, useCase) VALUES (?, ?)`);

  database.exec("BEGIN");
  try {
    for (const v of raw) {
      insertVehicle.run(
        v.id, v.make, v.model, v.year, v.bodyType, v.segment, v.priceMin, v.priceMax,
        v.seats, v.cargoCuFt, v.mpgCity, v.mpgHwy, v.mpgCombined, v.fuelType, v.evRangeMi,
        v.drivetrain, v.awdAvailable ? 1 : 0, v.zeroToSixty, v.horsepower, v.towingLbs,
        v.groundClearanceIn, v.offroad ? 1 : 0, v.safetyRating, v.reliabilityScore,
        v.techScore, v.comfortScore, v.officialSite ?? "", v.notes ?? ""
      );
      for (const f of v.features ?? []) insertFeature.run(v.id, f);
      for (const u of v.useCases ?? []) insertUseCase.run(v.id, u);
    }
    database.exec("COMMIT");
    console.log(`[db] seeded ${raw.length} vehicles into ${DB_PATH}`);
  } catch (err) {
    database.exec("ROLLBACK");
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getAllVehicles(): Promise<Vehicle[]> {
  if (cachedVehicles) return cachedVehicles;
  const fromSqlite = await getSqliteVehicles();
  cachedVehicles = fromSqlite ?? loadFromJson();
  return cachedVehicles;
}
