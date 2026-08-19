import type { Preferences, RecommendResponse } from "./types";

const BASE = ""; // same-origin

export async function fetchRecommendations(prefs: Preferences): Promise<RecommendResponse & { preferences: Preferences }> {
  const res = await fetch(`${BASE}/api/recommend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(prefs),
  });
  if (!res.ok) throw new Error(`recommend failed: ${res.status}`);
  return res.json();
}

export interface ChatResponse {
  assistantReply: string;
  source: "ollama" | "anthropic" | "rules";
  extracted: Partial<Preferences>;
  preferences: Partial<Preferences>;
}

export async function sendChatMessage(
  message: string,
  currentPreferences: Partial<Preferences>
): Promise<ChatResponse> {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, currentPreferences }),
  });
  if (!res.ok) throw new Error(`chat failed: ${res.status}`);
  return res.json();
}

export interface ListingLink {
  site: string;
  label: string;
  url: string;
}

export async function fetchListings(
  vehicleId: string,
  zip: string,
  radius: number,
  maxPrice: number,
  condition: string
): Promise<ListingLink[]> {
  const params = new URLSearchParams({
    vehicleId,
    zip,
    radius: String(radius),
    maxPrice: String(maxPrice),
    condition,
  });
  const res = await fetch(`${BASE}/api/listings?${params.toString()}`);
  if (!res.ok) throw new Error(`listings failed: ${res.status}`);
  const data = await res.json();
  return data.links;
}
