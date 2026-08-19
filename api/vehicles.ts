import { getAllVehicles } from "../lib/db.ts";
import type { ApiRequest, ApiResponse } from "./_util.ts";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "method not allowed" });
  res.status(200).json(await getAllVehicles());
}
