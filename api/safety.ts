import { getNhtsaSafetyRating } from "../lib/nhtsa.js";
import type { ApiRequest, ApiResponse } from "./_util.js";

function first(v: string | string[] | undefined, fallback = ""): string {
  return Array.isArray(v) ? v[0] ?? fallback : v ?? fallback;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "method not allowed" });
  const make = first(req.query.make);
  const model = first(req.query.model);
  const year = Number(first(req.query.year, String(new Date().getFullYear())));
  const rating = await getNhtsaSafetyRating(make, model, year);
  res.status(200).json({ rating });
}
