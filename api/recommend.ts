import { getAllVehicles } from "../lib/db.js";
import { recommend } from "../lib/scoring.js";
import { mergePreferences } from "../lib/defaults.js";
import type { Preferences } from "../lib/types.js";
import type { ApiRequest, ApiResponse } from "./_util.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
  const body = (req.body ?? {}) as Partial<Preferences>;
  const prefs = mergePreferences(body);
  const all = await getAllVehicles();
  const result = recommend(all, prefs, 8);
  res.status(200).json({ preferences: prefs, ...result });
}
