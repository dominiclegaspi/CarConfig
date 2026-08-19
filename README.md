# CarConfig — an explainable vehicle recommendation engine

Answer a few questions (or just describe what you want in plain English), and
a deterministic, weighted multi-criteria scoring engine ranks 150 real
current-generation vehicles against your specific priorities — with the exact
reasoning behind every match, a side-by-side comparison view, and real
search links into live marketplace inventory near you.

This is **not** "ask an LLM what car to buy." The LLM (or the free
rule-based fallback) only does one narrow job: turning fuzzy human language
into a structured preferences object. All of the actual ranking, scoring,
and explanation is a transparent, unit-tested algorithm you can read
top-to-bottom in `server/lib/scoring.ts`.

## Why this stack

Everything here runs for **$0**, with **zero required paid services**, and
(ideally) as few moving parts as possible so the whole system fits in your
head:

- **No Next.js/Vite/webpack.** A plain Node `http` server (`server/index.ts`)
  and a small esbuild bundling script (`web/build.js`) do the same job with
  far less magic. Every route is one `if` block you can read start to finish.
- **No Postgres/Prisma/ORM.** `node:sqlite` — built directly into Node 22.5+
  — gives a real relational database (see the schema in `server/lib/db.ts`)
  with zero installs.
- **No paid listings API.** Auto.dev and Visor both require paid API keys.
  Instead, `server/lib/listings.ts` builds verified, working deep-link search
  URLs into Autotrader, TrueCar, and Cars.com, pre-filled with the
  recommended vehicle plus your ZIP/radius/price — real inventory, zero API
  cost. (See "Real listings" below for exactly how this was verified and its
  honest limitations.)
- **No required paid AI.** The natural-language intake (`server/lib/parse.ts`)
  tries a local, free, open-source LLM via [Ollama](https://ollama.com)
  first, falls back to a zero-dependency rule-based parser if Ollama isn't
  running, and only touches a paid API (Anthropic) if you explicitly set an
  API key. The product fully works with nothing installed beyond Node.
- **Real government data where it's free.** `server/lib/nhtsa.ts` pulls
  NHTSA's public, keyless SafetyRatings API as a best-effort enrichment on
  top of the curated dataset.

If you later want to swap the plain Node server for Next.js API routes, the
migration is close to 1:1 — every route handler in `server/index.ts` is
already a small pure-ish function; see "Migrating to Next.js" below.

## Architecture

```
                     ┌────────────────────┐
                     │   React frontend    │  (web/src, bundled by esbuild)
                     │  wizard · chat ·     │
                     │  results · compare   │
                     └──────────┬───────────┘
                                │ fetch()
                     ┌──────────▼───────────┐
                     │   Node http server    │  server/index.ts
                     │   (zero framework)    │
                     └──────────┬───────────┘
                                │
      ┌─────────────┬──────────┼───────────┬───────────────┐
      ▼             ▼          ▼           ▼               ▼
 lib/parse.ts   lib/scoring.ts │      lib/listings.ts  lib/nhtsa.ts
 NL → structured  hard filter  │      marketplace       free gov't
 preferences      + percentile │      deep-links         safety data
 (Ollama → Claude normalize +  │
  → rules,        weighted +   │
  in that order)   cosine rank │
                                ▼
                          lib/db.ts
                     node:sqlite (150 vehicles,
                     seeded from data/vehicles.json)
```

## The algorithm (the interesting part)

`server/lib/scoring.ts` implements the pipeline:

1. **Hard filters** (`applyHardFilters`) — budget, seats, body type,
   drivetrain, fuel type, and free-text dealbreakers narrow the full catalog
   to a candidate set. If a combination of filters is too narrow (or
   impossible), it **progressively relaxes** constraints — widening budget
   tolerance, then dropping drivetrain/fuel, then body type — and reports
   exactly what it relaxed, rather than silently returning nothing.

2. **Percentile feature normalization** (`scoreCandidates`) — every raw spec
   (horsepower, 0-60, cargo volume, tech/comfort/reliability ratings, a
   fuel-cost-per-mile efficiency figure that makes gas/hybrid/EV comparable,
   and a modeled annual ownership cost) is normalized to 0–100 **relative to
   the current candidate set**, not a fixed global scale — so "efficiency"
   among a shortlist of trucks is judged against other trucks, not against a
   Prius. Nine subscores come out of this step: performance, reliability,
   efficiency, cargo/space, safety, technology, comfort, luxury, value.

3. **Weighted scoring + vector similarity** (`buildWeights` /
   `rankByWeightedScore`) — your selected priorities (ranked by the order you
   picked them) and the performance-importance slider build a weight vector.
   The final match score blends two signals: 85% classic weighted sum, 15%
   **cosine similarity** between your weight vector and each candidate's
   subscore vector — a content-based-filtering technique that rewards cars
   whose overall *shape* of strengths matches what you said you care about,
   not just raw magnitude.

4. **Explanation** (`explain`) — the top-contributing weighted factors become
   "why this fits" bullets; the weakest relative subscore becomes a
   transparent tradeoff. Nothing here is templated LLM prose — it's derived
   directly from the same numbers used to rank.

This whole pipeline is pure, synchronous, and has no external dependencies,
which is what makes it unit-testable (see `tests/scoring.test.ts`) — for
example, one test asserts that a strongly-weighted "performance" priority
actually outranks a mundane commuter sedan with a sports car, and another
asserts every weight vector sums to 1.

## The AI/NLP layer

`server/lib/parse.ts` converts something like:

> "I'm a college student, drive about 12k miles a year, want something
> sporty but reliable, and don't want to spend more than $25k. No trucks."

into:

```json
{
  "budgetMax": 25000,
  "priorities": ["performance", "reliability"],
  "performanceImportance": 8,
  "annualMileage": "10-15k",
  "dealbreakers": "truck"
}
```

Three tiers, tried in order, so it always works with zero setup:

1. **Ollama** (free, open-source, local, no API key) — if you run
   `ollama pull llama3.2` and have Ollama running, the app uses it
   automatically.
2. **Anthropic API** — only if you set `ANTHROPIC_API_KEY`; off by default
   since it costs money.
3. **Deterministic rule-based parser** — regex + keyword extraction with
   negation handling (so "no trucks" excludes trucks instead of requesting
   one — an actual bug caught by the test suite while building this) and
   context-aware budget parsing (so "about 12k miles a year" isn't mistaken
   for a $12k budget — also caught by a test). Zero dependencies, always
   available, and exactly what runs if Ollama/Anthropic time out.

Every LLM response is sanitized against a strict whitelist (`sanitizeLlmOutput`)
before it touches the scoring engine — enum values and numeric ranges are
validated, nothing free-form from the model reaches the database or the UI
unchecked.

## Real listings, honestly

The three listing-site URL schemes in `server/lib/listings.ts` were verified
by hand against the live sites (fetching real search-result pages and
confirming the make/model/zip/price filters actually applied) before being
encoded. They are **not** a live inventory API — no per-VIN price/mileage
data comes back into the app — they're working deep links that drop the user
straight into a real, pre-filtered search on Autotrader, TrueCar, or
Cars.com. If you want actual structured listing data (VINs, live prices,
dealer distance), the natural upgrade is
[Auto.dev](https://www.auto.dev/) or [Visor](https://visor.vin/) — both
require a paid API key, so they're intentionally not wired in by default.
Swapping one in is a single new function in `lib/listings.ts` plus a fetch
call in the `/api/listings` route.

## Deploying

The app deploys to Vercel as-is: a static frontend (`public/`, built by
esbuild) plus five serverless functions under `api/*.ts` that call the exact
same `lib/*.ts` logic the local dev server uses — nothing is duplicated or
reimplemented for production.

1. Push this repo to GitHub (see below).
2. Go to [vercel.com/new](https://vercel.com/new), "Import Git Repository",
   pick the repo. Vercel reads `vercel.json` and just works — no
   configuration needed. Framework preset: "Other".
3. Deploy. That's it — no environment variables are required.

**One behavior difference in production:** the free local-LLM chat parser
(`OLLAMA_URL=http://localhost:11434`) only works when *you* run the app
locally with Ollama running on *your* machine — "localhost" inside a Vercel
serverless function refers to Vercel's container, not your laptop. On
Vercel, `/api/chat` automatically falls through to the Anthropic tier (if
you set `ANTHROPIC_API_KEY` in the Vercel project's Environment Variables)
or otherwise the zero-dependency rule-based parser — both still fully
functional, just not the local-Ollama tier. Everything else (the scoring
engine, listings links, NHTSA enrichment) behaves identically in prod and
locally.

**Database on Vercel:** `lib/db.ts` detects the `VERCEL` environment
variable Vercel sets automatically and skips `node:sqlite` entirely in favor
of reading `data/vehicles.json` straight into memory — serverless functions
get a read-only filesystem and cold-started instances, so a persisted `.db`
file doesn't fit that model anyway. Locally, `npm start` still uses real
SQLite. Same `getAllVehicles()` call either way; nothing else in the app
needs to know which backend served it.

### Pushing to GitHub

```bash
git init                      # if not already a repo
git add -A
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/carconfig.git
git push -u origin main
```

(Create the empty repo first at [github.com/new](https://github.com/new) —
don't initialize it with a README/license so the push above doesn't
conflict.)

## Getting started

```bash
npm install
npm start        # builds the frontend bundle, seeds SQLite on first run, starts the server
```

Then open http://localhost:3000.

For live-reload during development:

```bash
npm run dev       # esbuild --watch + tsx --watch, running concurrently
```

Optional — free local AI for the "describe what you want" chat intake:

```bash
# install Ollama from https://ollama.com, then:
ollama pull llama3.2
# the app auto-detects it; no other configuration needed
```

Run the algorithm test suite (dependency-free, no server needed):

```bash
npm test
```

Run the full browser smoke test (requires Playwright as a one-time dev
install, and the server already running in another terminal):

```bash
npm install -D playwright && npx playwright install chromium
npm run test:e2e
```

## Project structure

```
lib/
  types.ts             Shared TypeScript types (Vehicle, Preferences, ...)
  db.ts                 node:sqlite locally, JSON-in-memory on Vercel (see above)
  scoring.ts             The recommendation engine (see above)
  parse.ts                 NL → structured preferences (Ollama/Anthropic/rules)
  listings.ts               Real marketplace search-link builder
  nhtsa.ts                    Free NHTSA safety-rating enrichment
  defaults.ts                   Default preferences + merge helper
server/
  index.ts             Zero-framework Node HTTP server — used for local dev
                       (`npm start`/`npm run dev`); imports lib/ directly.
api/
  vehicles.ts, recommend.ts, chat.ts, listings.ts, safety.ts
                        Vercel serverless functions — the production entry
                       point when deployed. Each one is a thin ~15-line
                       wrapper around the same lib/ functions server/index.ts
                       calls locally, so there is exactly one implementation
                       of every route's logic, just two thin adapters for it.
web/
  src/                  React 19 + TypeScript frontend (function components,
                        no external state library — preferences/results are
                        lifted state in App.tsx)
  build.js              esbuild bundling script (no webpack/Vite config)
data/
  vehicles.json          150-vehicle curated dataset (2026 model year,
                         pricing grounded against August 2026 market research)
  build_data.py           The script that generated vehicles.json
scripts/seed.ts         Explicit DB seed/reset command
vercel.json              Vercel build config (see "Deploying" above)
tests/
  scoring.test.ts         Algorithm unit tests (node:test, zero deps)
  parse.test.ts            NLP parser unit tests
  e2e.smoke.mjs             Optional Playwright browser smoke test
```

## Migrating to Next.js later

Every function in `lib/*.ts` is framework-agnostic — none of them import
`http`, Express, or anything server-specific, which is exactly what made it
possible to add the Vercel `api/*.ts` functions above without touching any
actual logic. To move to Next.js instead:

1. `npx create-next-app` and copy `lib/*` in as-is.
2. Turn each `api/*.ts` file into `app/api/.../route.ts`, changing the
   handler signature from `(req, res)` to `export async function GET/POST(request: Request)`
   — the body of each function barely changes since it's all just calls
   into `lib/`.
3. Copy `web/src/*` into `app/` (or `components/`); the `fetch("/api/...")`
   calls in `web/src/api.ts` don't need to change at all.

## Honest limitations

- The vehicle dataset (`data/vehicles.json`) is a curated, hand-researched
  snapshot — not a live feed from an OEM or pricing API. Prices are
  directional estimates for the 2026 model year, grounded against August
  2026 market research (average new-car transaction prices, segment-level
  price trend predictions), not live MSRPs.
- Reliability/technology/comfort scores are directional estimates based on
  well-known brand/model reputations, not a licensed data feed (e.g. J.D.
  Power or Consumer Reports) — they're clearly labeled as estimates in the
  code and could be swapped for a real licensed dataset later.
- The ownership-cost projection is a simplified model (segment-based
  maintenance/insurance baselines + assumed fuel/electricity prices), meant
  as a relative ranking signal between candidates, not a quote.
- NHTSA's SafetyRatings coverage lags the current model year by 1–2 years,
  so the live enrichment often falls back to "not yet rated" for brand-new
  models — this is expected, not a bug.
