// Optional browser smoke test — not part of `npm test` (which only runs the
// dependency-free algorithm unit tests). This one drives the real UI with
// Playwright to catch integration bugs the unit tests can't see: click
// through the wizard, confirm results render, expand listings, open compare.
//
// Requires: the server already running (`npm start` in another terminal)
// and Playwright installed (`npm install -D playwright && npx playwright install chromium`).
//
// Usage: BASE_URL=http://localhost:3000 node tests/e2e.smoke.mjs

import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const OUT_DIR = process.env.SCREENSHOT_DIR || "/tmp";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
page.on("pageerror", (err) => errors.push("pageerror: " + err.message));

await page.goto(BASE_URL, { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT_DIR}/01_landing.png` });

await page.click('button:has-text("Answer guided questions")');

// Step 0: budget
await page.fill("input[type=number] >> nth=0", "25000");
await page.fill("input[type=number] >> nth=1", "45000");
await page.click("text=Next");

// Step 1: condition
await page.click("text=Either");
await page.click("text=Next");

// Step 2: priorities (order = weight, first click ranks highest)
await page.click("text=Safety");
await page.click("text=Reliability");
await page.click("text=Cargo space");
await page.click("text=Next");

// Step 3: performance slider — leave default
await page.click("text=Next");

// Step 4: mileage
await page.click("text=10,000–15,000 mi/yr");
await page.click("text=Next");

// Step 5: environment
await page.click("text=Suburbs");
await page.click("text=Next");

// Step 6: drivetrain + fuel
await page.click("text=All-wheel drive");
await page.click("button.chip:has-text(\"Doesn't matter\") >> nth=1");
await page.click("text=Next");

// Step 7: body type + seats
await page.click("text=Midsize / 3-row SUV");
await page.locator("input[type=number]").fill("7");
await page.click("text=Next");

// Step 8: dealbreakers + zip
await page.fill('input[placeholder="e.g. 90210"]', "90210");
await page.click('button:has-text("See my matches")');

await page.waitForSelector(".result-card", { timeout: 15000 });
await page.screenshot({ path: `${OUT_DIR}/02_results.png`, fullPage: true });

// Expand listings on the first result.
await page.click('text=See available listings >> nth=0');
await page.waitForTimeout(500);

// Select two cards to compare.
const compareBoxes = page.locator(".compare-toggle input[type=checkbox]");
await compareBoxes.nth(0).check();
await compareBoxes.nth(1).check();
await page.click("text=Compare 2 selected");
await page.waitForSelector(".compare-panel");
await page.screenshot({ path: `${OUT_DIR}/03_compare.png` });

await browser.close();

if (errors.length > 0) {
  console.error("Console/page errors detected:", errors);
  process.exit(1);
}
console.log(`Smoke test passed — screenshots written to ${OUT_DIR}/`);
