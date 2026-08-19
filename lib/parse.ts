// ---------------------------------------------------------------------------
// Natural-language preference extraction: "translate what the user typed
// into the structured Preferences object scoring.ts consumes."
//
// Three tiers, tried in order, so the product always works even with zero
// setup and zero cost:
//   1. Local open-source LLM via Ollama (http://localhost:11434) — free,
//      runs entirely on the user's machine, no API key, no usage limits.
//      Install: https://ollama.com, then `ollama pull llama3.2`.
//   2. Anthropic API, only if ANTHROPIC_API_KEY is set in the environment —
//      an optional upgrade path, off by default (costs money).
//   3. Deterministic rule-based extractor (regex + keyword matching) — zero
//      dependencies, zero network calls, always available. This is also
//      exactly what runs in Ollama/Anthropic's outage/timeout path, so the
//      product degrades gracefully instead of breaking.
// ---------------------------------------------------------------------------

import type { Preferences, PriorityKey } from "./types.ts";

export type ParseSource = "ollama" | "anthropic" | "rules";

export interface ParseResult {
  preferences: Partial<Preferences>;
  source: ParseSource;
  assistantReply: string;
}

const PRIORITY_KEYWORDS: Record<PriorityKey, string[]> = {
  reliability: ["reliable", "reliability", "dependable", "won't break down", "long lasting", "durable"],
  performance: ["fast", "quick", "sporty", "fun to drive", "powerful", "performance", "speed", "acceleration"],
  fuelEconomy: ["fuel efficient", "mpg", "gas mileage", "fuel economy", "good on gas", "efficient", "cheap on gas"],
  luxury: ["luxury", "luxurious", "upscale", "premium", "high-end"],
  technology: ["tech", "infotainment", "screen", "apple carplay", "android auto", "self-driving", "driver assist"],
  cargoSpace: ["cargo", "trunk space", "hauling", "haul", "storage", "room for gear"],
  safety: ["safe", "safety", "crash rating", "kids", "family safety"],
  comfort: ["comfortable", "comfort", "smooth ride", "quiet cabin", "roomy"],
};

const BODY_TYPE_KEYWORDS: Record<string, string[]> = {
  sedan: ["sedan"],
  hatchback: ["hatchback", "hatch"],
  "suv-compact": ["compact suv", "small suv", "crossover"],
  "suv-midsize": ["midsize suv", "3-row", "three row"],
  "suv-large": ["full-size suv", "large suv"],
  minivan: ["minivan", "van"],
  "pickup-full": ["truck", "pickup", "full-size truck"],
  "pickup-compact": ["small truck", "compact truck", "mid-size truck"],
  "sports-car": ["sports car", "coupe", "convertible"],
};

// Words that, when they appear near a bare "Nk"/"N,000" number, confirm
// it's talking about money rather than mileage, age, RPM, etc. Bare numbers
// with a literal "$" are always treated as budget regardless of context.
const MONEY_CONTEXT = /(spend|budget|price|cost|afford|pay|\$)/;
const MILEAGE_CONTEXT = /(mile|mileage|miles|drive|driving|commute|km|kilometer)/;

function extractBudget(text: string): { budgetMin?: number; budgetMax?: number } {
  const lower = text.toLowerCase();
  const num = (raw: string): number => {
    let v = raw.replace(/[\$,]/g, "");
    if (/k$/i.test(v)) return parseFloat(v) * 1000;
    return parseFloat(v);
  };

  // "don't want to spend more than X" / "not spend over X" / "no more than X"
  // — all colloquial ways of stating a budget ceiling in this domain.
  const spendCeiling = lower.match(
    /spend\s+(?:no\s+)?(?:more than|over|around|up to|about)?\s*\$?(\d[\d,]*\.?\d*k?)/i
  );
  if (spendCeiling) {
    return { budgetMin: 0, budgetMax: num(spendCeiling[1]) };
  }

  const under = lower.match(/(?:under|below|less than|no more than|max(?:imum)?(?: of)?)\s*\$?(\d[\d,]*\.?\d*k?)/i);
  if (under) {
    return { budgetMin: 0, budgetMax: num(under[1]) };
  }

  const range = lower.match(/\$(\d[\d,]*\.?\d*k?)\s*(?:-|to|–)\s*\$?(\d[\d,]*\.?\d*k?)/i);
  if (range) {
    return { budgetMin: num(range[1]), budgetMax: num(range[2]) };
  }

  // "around"/"about"/"roughly" signals a fuzzy target, not a hard ceiling —
  // checked before the bare-"$"-is-a-ceiling fallback so "around $18,000"
  // yields a range rather than treating $18,000 as a strict max. A literal
  // "$" nearby is unambiguous money regardless of mileage-sounding context;
  // without one, require a money word and no closer mileage word, so "about
  // 12k miles a year" is never mistaken for a $12k budget.
  const around = lower.match(/(?:around|about|roughly|~)\s*\$?\s*(\d[\d,]*\.?\d*k?)\b/i);
  if (around && around.index !== undefined) {
    const hasDollarSign = around[0].includes("$");
    const windowStart = Math.max(0, around.index - 25);
    const windowEnd = Math.min(lower.length, around.index + around[0].length + 15);
    const window = lower.slice(windowStart, windowEnd);
    if (hasDollarSign || (MONEY_CONTEXT.test(window) && !MILEAGE_CONTEXT.test(window))) {
      const v = num(around[1]);
      return { budgetMin: Math.round(v * 0.85), budgetMax: Math.round(v * 1.15) };
    }
  }

  // Bare "$" amounts (no "around"/"under"/range wording) are treated as an
  // unambiguous ceiling.
  const dollarSign = lower.match(/\$\s?(\d[\d,]*\.?\d*k?)/i);
  if (dollarSign) {
    return { budgetMin: 0, budgetMax: num(dollarSign[1]) };
  }
  return {};
}

function extractAnnualMileage(text: string): Preferences["annualMileage"] | undefined {
  const lower = text.toLowerCase();
  const match = lower.match(/(\d[\d,]*\.?\d*)\s*k?\s*(?:miles|mile)\b/i);
  if (match) {
    const raw = match[0];
    let n = parseFloat(match[1].replace(/,/g, ""));
    if (/k/i.test(raw)) n *= 1000;
    if (n < 5000) return "<5k";
    if (n < 10000) return "5-10k";
    if (n < 15000) return "10-15k";
    return "15k+";
  }
  if (/long commute|drive a lot|road warrior|high mileage/.test(lower)) return "15k+";
  if (/barely drive|don't drive much|short commute|low mileage/.test(lower)) return "<5k";
  return undefined;
}

function extractEnvironment(text: string): Preferences["environment"] | undefined {
  const lower = text.toLowerCase();
  if (/\burban\b|\bcity\b|downtown|tight parking/.test(lower)) return "city";
  if (/\bsuburb/.test(lower)) return "suburbs";
  if (/\brural\b|farm|countryside|dirt road|off-road|off road/.test(lower)) return "rural";
  return undefined;
}

function extractSeats(text: string): number | undefined {
  const lower = text.toLowerCase();
  const seatsMatch = lower.match(/(\d+)\s*(?:seats?|seaters?|passengers?)/);
  if (seatsMatch) return parseInt(seatsMatch[1], 10);
  const familyMatch = lower.match(/family of\s*(\d+)/);
  if (familyMatch) return Math.max(parseInt(familyMatch[1], 10), 4);
  if (/\bkids?\b|\bchildren\b|\bfamily\b/.test(lower)) return 5;
  return undefined;
}

const NEGATION_WINDOW = 18;
const NEGATION_RE = /\b(no|not|don't|dont|do not|avoid|without|never|hate|dislike)\b/;

/** True if a negation word appears shortly before the match at `index`. */
function isNegatedAt(lower: string, index: number): boolean {
  const start = Math.max(0, index - NEGATION_WINDOW);
  const window = lower.slice(start, index);
  return NEGATION_RE.test(window);
}

function extractCondition(text: string): Preferences["condition"] | undefined {
  const lower = text.toLowerCase();
  if (/\bused\b|\bpre-?owned\b/.test(lower) && !/\bnew\b/.test(lower)) return "used";
  if (/\bnew\b/.test(lower) && !/\bused\b/.test(lower)) return "new";
  if (/either|doesn't matter|don't care|no preference/.test(lower)) return "either";
  return undefined;
}

function extractFuelType(text: string): { value?: Preferences["fuelType"]; excludedWords: string[] } {
  const lower = text.toLowerCase();
  const excludedWords: string[] = [];
  const checks: [RegExp, Preferences["fuelType"]][] = [
    [/\bev\b|electric only|electric vehicle/, "ev"],
    [/hybrid/, "hybrid"],
    [/\bgas\b|gasoline|combustion/, "gas"],
  ];
  for (const [re, val] of checks) {
    const m = lower.match(re);
    if (m && m.index !== undefined) {
      if (isNegatedAt(lower, m.index)) {
        excludedWords.push(val);
      } else {
        return { value: val, excludedWords };
      }
    }
  }
  return { excludedWords };
}

function extractDrivetrain(text: string): Preferences["drivetrain"] | undefined {
  const lower = text.toLowerCase();
  const checks: [RegExp, Preferences["drivetrain"]][] = [
    [/\bawd\b|all[- ]wheel drive/, "AWD"],
    [/\b4wd\b|four[- ]wheel drive|4x4/, "4WD"],
    [/\brwd\b|rear[- ]wheel drive/, "RWD"],
    [/\bfwd\b|front[- ]wheel drive/, "FWD"],
  ];
  for (const [re, val] of checks) {
    const m = lower.match(re);
    if (m && m.index !== undefined && !isNegatedAt(lower, m.index)) return val;
  }
  return undefined;
}

/** Returns wanted body types plus any that were explicitly negated (e.g. "no trucks"). */
function extractBodyTypes(text: string): { wanted: string[]; excludedWords: string[] } {
  const lower = text.toLowerCase();
  const wanted: string[] = [];
  const excludedWords: string[] = [];
  for (const [type, keywords] of Object.entries(BODY_TYPE_KEYWORDS)) {
    for (const kw of keywords) {
      const idx = lower.indexOf(kw);
      if (idx === -1) continue;
      if (isNegatedAt(lower, idx)) {
        excludedWords.push(kw);
      } else {
        wanted.push(type);
      }
      break;
    }
  }
  return { wanted, excludedWords };
}

function extractPriorities(text: string): PriorityKey[] {
  const lower = text.toLowerCase();
  const scored: { key: PriorityKey; index: number }[] = [];
  for (const [key, keywords] of Object.entries(PRIORITY_KEYWORDS) as [PriorityKey, string[]][]) {
    for (const kw of keywords) {
      const idx = lower.indexOf(kw);
      if (idx !== -1) {
        scored.push({ key, index: idx });
        break;
      }
    }
  }
  scored.sort((a, b) => a.index - b.index);
  const seen = new Set<PriorityKey>();
  const ordered: PriorityKey[] = [];
  for (const s of scored) {
    if (!seen.has(s.key)) {
      seen.add(s.key);
      ordered.push(s.key);
    }
  }
  return ordered;
}

function extractPerformanceImportance(text: string, priorities: PriorityKey[]): number | undefined {
  const lower = text.toLowerCase();
  if (/very (fast|sporty|quick)|need speed|track/.test(lower)) return 9;
  if (priorities[0] === "performance") return 8;
  if (priorities.includes("performance")) return 6;
  if (/don't care about speed|not fast|practical over fun/.test(lower)) return 2;
  return undefined;
}

/** Explicit "don't want X" / "no X" phrases, as free text kept for hard-filter matching. */
function extractDealbreakerPhrase(text: string): string | undefined {
  const lower = text.toLowerCase();
  // Negative lookahead skips "don't want to spend/pay ..." (a budget
  // statement, already handled by extractBudget) so it isn't double-counted
  // as an unrelated dealbreaker phrase.
  const match = lower.match(/(?:don't want|do not want|not into|hate|dislike)\s+(?!to spend|to pay)(?:a |an )?([a-z0-9 ,'-]{2,40})/);
  if (!match) return undefined;
  // Trim at the first clause boundary so trailing unrelated clauses
  // ("...no trucks" tacked on after a comma) don't get swept in twice.
  const phrase = match[1].split(/,| and | but /)[0].trim();
  return phrase || undefined;
}

/** Tier 3: deterministic rule-based extraction. Always available, zero dependencies. */
export function ruleBasedParse(text: string): Partial<Preferences> {
  const { budgetMin, budgetMax } = extractBudget(text);
  const seatsMin = extractSeats(text);
  const condition = extractCondition(text);
  const fuel = extractFuelType(text);
  const drivetrain = extractDrivetrain(text);
  const bodies = extractBodyTypes(text);
  const priorities = extractPriorities(text);
  const performanceImportance = extractPerformanceImportance(text, priorities);
  const annualMileage = extractAnnualMileage(text);
  const environment = extractEnvironment(text);
  const dealbreakerPhrase = extractDealbreakerPhrase(text);

  // Consolidate every negated signal ("no trucks", "not electric") into one
  // dealbreakers string, which the scoring engine's hard filter already
  // knows how to match against make/bodyType/fuelType keywords.
  const excludedWords = [...new Set([...bodies.excludedWords, ...fuel.excludedWords])];
  const dealbreakers = [...new Set([dealbreakerPhrase, ...excludedWords].filter(Boolean))].join(", ");

  const prefs: Partial<Preferences> = {};
  if (budgetMin !== undefined) prefs.budgetMin = budgetMin;
  if (budgetMax !== undefined) prefs.budgetMax = budgetMax;
  if (seatsMin !== undefined) prefs.seatsMin = seatsMin;
  if (condition) prefs.condition = condition;
  if (fuel.value) prefs.fuelType = fuel.value;
  if (drivetrain) prefs.drivetrain = drivetrain;
  if (bodies.wanted.length) prefs.bodyTypes = bodies.wanted;
  if (priorities.length) prefs.priorities = priorities;
  if (performanceImportance !== undefined) prefs.performanceImportance = performanceImportance;
  if (annualMileage) prefs.annualMileage = annualMileage;
  if (environment) prefs.environment = environment;
  if (dealbreakers) prefs.dealbreakers = dealbreakers;
  return prefs;
}

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";

const SYSTEM_PROMPT = `You convert a car shopper's free-text description into JSON matching this shape (all fields optional, omit anything not mentioned):
{
  "budgetMin": number, "budgetMax": number,
  "condition": "new" | "used" | "either",
  "priorities": array of any of ["reliability","performance","fuelEconomy","luxury","technology","cargoSpace","safety","comfort"] ordered most-important-first,
  "performanceImportance": number 1-10,
  "annualMileage": "<5k" | "5-10k" | "10-15k" | "15k+",
  "environment": "city" | "suburbs" | "rural" | "mixed",
  "drivetrain": "FWD" | "RWD" | "AWD" | "4WD",
  "bodyTypes": array of any of ["sedan","hatchback","suv-compact","suv-midsize","suv-large","minivan","pickup-full","pickup-compact","sports-car"],
  "seatsMin": number,
  "fuelType": "gas" | "hybrid" | "ev",
  "dealbreakers": short string
}
Respond with ONLY the JSON object, no prose, no markdown fences.`;

async function tryOllama(text: string): Promise<Partial<Preferences> | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        system: SYSTEM_PROMPT,
        prompt: text,
        stream: false,
        format: "json",
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = (await res.json()) as { response: string };
    return sanitizeLlmOutput(JSON.parse(json.response));
  } catch {
    return null;
  }
}

async function tryAnthropic(text: string): Promise<Partial<Preferences> | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-latest",
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: text }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = (await res.json()) as { content: { type: string; text?: string }[] };
    const textBlock = json.content?.find((c) => c.type === "text")?.text ?? "{}";
    const cleaned = textBlock.replace(/```json|```/g, "").trim();
    return sanitizeLlmOutput(JSON.parse(cleaned));
  } catch {
    return null;
  }
}

/** Never trust raw LLM JSON blindly — whitelist keys/enums, clamp numbers. */
function sanitizeLlmOutput(raw: unknown): Partial<Preferences> {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const out: Partial<Preferences> = {};
  const priorityEnum = new Set(Object.keys(PRIORITY_KEYWORDS));
  const bodyTypeEnum = new Set(Object.keys(BODY_TYPE_KEYWORDS));

  if (typeof o.budgetMin === "number") out.budgetMin = clamp(o.budgetMin, 0, 250000);
  if (typeof o.budgetMax === "number") out.budgetMax = clamp(o.budgetMax, 0, 250000);
  if (o.condition === "new" || o.condition === "used" || o.condition === "either") out.condition = o.condition;
  if (Array.isArray(o.priorities)) {
    out.priorities = o.priorities.filter((p): p is PriorityKey => priorityEnum.has(String(p))) as PriorityKey[];
  }
  if (typeof o.performanceImportance === "number") out.performanceImportance = clamp(Math.round(o.performanceImportance), 1, 10);
  if (["<5k", "5-10k", "10-15k", "15k+"].includes(o.annualMileage as string)) out.annualMileage = o.annualMileage as Preferences["annualMileage"];
  if (["city", "suburbs", "rural", "mixed"].includes(o.environment as string)) out.environment = o.environment as Preferences["environment"];
  if (["FWD", "RWD", "AWD", "4WD"].includes(o.drivetrain as string)) out.drivetrain = o.drivetrain as Preferences["drivetrain"];
  if (Array.isArray(o.bodyTypes)) {
    out.bodyTypes = o.bodyTypes.filter((b) => bodyTypeEnum.has(String(b))) as string[];
  }
  if (typeof o.seatsMin === "number") out.seatsMin = clamp(Math.round(o.seatsMin), 2, 9);
  if (["gas", "hybrid", "ev"].includes(o.fuelType as string)) out.fuelType = o.fuelType as Preferences["fuelType"];
  if (typeof o.dealbreakers === "string") out.dealbreakers = o.dealbreakers.slice(0, 200);
  return out;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function summarize(prefs: Partial<Preferences>): string {
  const bits: string[] = [];
  if (prefs.budgetMax) bits.push(`budget up to $${prefs.budgetMax.toLocaleString()}`);
  if (prefs.condition) bits.push(prefs.condition);
  if (prefs.bodyTypes?.length) bits.push(prefs.bodyTypes.join("/"));
  if (prefs.fuelType) bits.push(prefs.fuelType);
  if (prefs.drivetrain) bits.push(prefs.drivetrain);
  if (prefs.priorities?.length) bits.push(`prioritizing ${prefs.priorities.slice(0, 3).join(", ")}`);
  if (!bits.length) return "I couldn't pull specific preferences from that — could you add a budget or body type?";
  return `Got it — ${bits.join(", ")}. Adjust anything below, then see your matches.`;
}

/** Public entry point used by the /api/chat route. */
export async function parsePreferences(text: string): Promise<ParseResult> {
  const ollama = await tryOllama(text);
  if (ollama && Object.keys(ollama).length > 0) {
    return { preferences: ollama, source: "ollama", assistantReply: summarize(ollama) };
  }
  const anthropic = await tryAnthropic(text);
  if (anthropic && Object.keys(anthropic).length > 0) {
    return { preferences: anthropic, source: "anthropic", assistantReply: summarize(anthropic) };
  }
  const rules = ruleBasedParse(text);
  return { preferences: rules, source: "rules", assistantReply: summarize(rules) };
}
