// Zero-framework HTTP server (Node's built-in `http` module only). No
// Express/Next.js required to install — matches the project's "$0 to run"
// goal. Routing is deliberately small and explicit rather than hidden
// behind a framework, which also makes it easy to read end-to-end.

import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getAllVehicles } from "../lib/db.ts";
import { recommend } from "../lib/scoring.ts";
import { buildListingLinks } from "../lib/listings.ts";
import { getNhtsaSafetyRating } from "../lib/nhtsa.ts";
import { parsePreferences } from "../lib/parse.ts";
import { mergePreferences } from "../lib/defaults.ts";
import type { Preferences } from "../lib/types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const PORT = Number(process.env.PORT) || 3000;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

async function readJsonBody<T>(req: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

function sendJson(res: http.ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, urlPath: string) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = safePath === "/" ? path.join(PUBLIC_DIR, "index.html") : path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath)) {
    // SPA fallback: any unknown non-/api route serves index.html.
    const fallback = path.join(PUBLIC_DIR, "index.html");
    const html = await readFile(fallback);
    res.writeHead(200, { "Content-Type": MIME[".html"] });
    res.end(html);
    return;
  }
  const ext = path.extname(filePath);
  const data = await readFile(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const { pathname } = url;

    // ---- CORS (harmless for a same-origin app; convenient for local dev
    // tooling / hitting the API directly while iterating on the frontend). ----
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (pathname === "/api/vehicles" && req.method === "GET") {
      return sendJson(res, 200, await getAllVehicles());
    }

    if (pathname === "/api/recommend" && req.method === "POST") {
      const body = await readJsonBody<Partial<Preferences>>(req);
      const prefs = mergePreferences(body);
      const all = await getAllVehicles();
      const result = recommend(all, prefs, 8);
      return sendJson(res, 200, { preferences: prefs, ...result });
    }

    if (pathname === "/api/chat" && req.method === "POST") {
      const body = await readJsonBody<{ message: string; currentPreferences?: Partial<Preferences> }>(req);
      if (!body.message || typeof body.message !== "string") {
        return sendJson(res, 400, { error: "message is required" });
      }
      const parsed = await parsePreferences(body.message);
      const merged: Partial<Preferences> = { ...(body.currentPreferences ?? {}), ...parsed.preferences };
      return sendJson(res, 200, {
        assistantReply: parsed.assistantReply,
        source: parsed.source,
        extracted: parsed.preferences,
        preferences: merged,
      });
    }

    if (pathname === "/api/listings" && req.method === "GET") {
      const vehicleId = url.searchParams.get("vehicleId") ?? "";
      const zip = url.searchParams.get("zip") ?? "";
      const radius = Number(url.searchParams.get("radius") ?? 50);
      const maxPrice = Number(url.searchParams.get("maxPrice") ?? 0);
      const condition = (url.searchParams.get("condition") ?? "either") as "new" | "used" | "either";
      const vehicle = (await getAllVehicles()).find((v) => v.id === vehicleId);
      if (!vehicle) return sendJson(res, 404, { error: "vehicle not found" });
      const links = buildListingLinks(vehicle, { zip, radiusMiles: radius, maxPrice, condition });
      return sendJson(res, 200, { links });
    }

    if (pathname === "/api/safety" && req.method === "GET") {
      const make = url.searchParams.get("make") ?? "";
      const model = url.searchParams.get("model") ?? "";
      const year = Number(url.searchParams.get("year") ?? new Date().getFullYear());
      const rating = await getNhtsaSafetyRating(make, model, year);
      return sendJson(res, 200, { rating });
    }

    if (pathname.startsWith("/api/")) {
      return sendJson(res, 404, { error: "not found" });
    }

    return serveStatic(req, res, pathname);
  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { error: (err as Error).message });
  }
});

server.listen(PORT, () => {
  console.log(`car-finder server listening on http://localhost:${PORT}`);
});
