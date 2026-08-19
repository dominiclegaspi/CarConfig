// Minimal structural types matching Vercel's Node.js serverless function
// runtime (@vercel/node) — req.query/req.body are pre-parsed, res gets
// .status()/.json() helpers on top of the normal Node ServerResponse. Kept
// as hand-written structural types instead of an @vercel/node dependency
// so the project has no required devDependency just for this; if you `npm
// install -D @vercel/node` locally you can swap these for the real
// VercelRequest/VercelResponse types with no code changes.
import type { IncomingMessage, ServerResponse } from "node:http";

export interface ApiRequest extends IncomingMessage {
  query: Record<string, string | string[] | undefined>;
  body: unknown;
}

export interface ApiResponse extends ServerResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
  send(body: unknown): void;
}
