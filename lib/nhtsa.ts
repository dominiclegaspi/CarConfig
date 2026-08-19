// Optional real-world data enrichment via NHTSA's free, public, no-API-key
// vPIC / SafetyRatings APIs (api.nhtsa.gov). This is genuine government
// crash-test data layered on top of our own curated estimates — best-effort
// only, since NHTSA's ratings coverage lags a year or two behind the current
// model year, and the request is skipped entirely if it times out or errors.

const NHTSA_TIMEOUT_MS = 3500;

async function fetchWithTimeout(url: string, timeoutMs = NHTSA_TIMEOUT_MS): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok ? res : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface NhtsaRating {
  vehicleDescription: string;
  overallRating: string | null;
  vehicleId: number;
}

/**
 * Looks up NHTSA 5-Star Safety Ratings for a given make/model, trying the
 * requested year and then a couple of prior model years (body-on-frame
 * ratings rarely change year to year within a generation, so this still
 * gives a meaningful signal even when the exact year isn't rated yet).
 */
export async function getNhtsaSafetyRating(
  make: string,
  model: string,
  year: number
): Promise<NhtsaRating | null> {
  for (const y of [year, year - 1, year - 2]) {
    const listUrl = `https://api.nhtsa.gov/SafetyRatings/modelyear/${y}/make/${encodeURIComponent(
      make
    )}/model/${encodeURIComponent(model)}?format=json`;
    const listRes = await fetchWithTimeout(listUrl);
    if (!listRes) continue;
    const listJson = (await listRes.json()) as {
      Count: number;
      Results: { VehicleId: number; VehicleDescription: string }[];
    };
    if (!listJson.Results?.length) continue;

    const first = listJson.Results[0];
    const detailUrl = `https://api.nhtsa.gov/SafetyRatings/VehicleId/${first.VehicleId}?format=json`;
    const detailRes = await fetchWithTimeout(detailUrl);
    if (!detailRes) {
      return { vehicleDescription: first.VehicleDescription, overallRating: null, vehicleId: first.VehicleId };
    }
    const detailJson = (await detailRes.json()) as { Results: { OverallRating?: string }[] };
    const overall = detailJson.Results?.[0]?.OverallRating ?? null;
    return {
      vehicleDescription: first.VehicleDescription,
      overallRating: overall && overall !== "Not Rated" ? overall : null,
      vehicleId: first.VehicleId,
    };
  }
  return null;
}
