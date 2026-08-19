import { getAllVehicles } from "../lib/db.js";
import { buildListingLinks } from "../lib/listings.js";
import type { ApiRequest, ApiResponse } from "./_util.js";

function first(v: string | string[] | undefined, fallback = ""): string {
  return Array.isArray(v) ? v[0] ?? fallback : v ?? fallback;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "method not allowed" });
  const vehicleId = first(req.query.vehicleId);
  const zip = first(req.query.zip);
  const radius = Number(first(req.query.radius, "50"));
  const maxPrice = Number(first(req.query.maxPrice, "0"));
  const condition = first(req.query.condition, "either") as "new" | "used" | "either";

  const vehicle = (await getAllVehicles()).find((v) => v.id === vehicleId);
  if (!vehicle) return res.status(404).json({ error: "vehicle not found" });

  const links = buildListingLinks(vehicle, { zip, radiusMiles: radius, maxPrice, condition });
  res.status(200).json({ links });
}
