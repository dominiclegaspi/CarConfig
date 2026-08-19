import { parsePreferences } from "../lib/parse.js";
import type { Preferences } from "../lib/types.js";
import type { ApiRequest, ApiResponse } from "./_util.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
  const body = (req.body ?? {}) as { message?: string; currentPreferences?: Partial<Preferences> };
  if (!body.message || typeof body.message !== "string") {
    return res.status(400).json({ error: "message is required" });
  }
  const parsed = await parsePreferences(body.message);
  const merged: Partial<Preferences> = { ...(body.currentPreferences ?? {}), ...parsed.preferences };
  res.status(200).json({
    assistantReply: parsed.assistantReply,
    source: parsed.source,
    extracted: parsed.preferences,
    preferences: merged,
  });
}
