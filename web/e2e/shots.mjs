/**
 * Screenshot matrix and console check, driven by the installed Chrome (no browser
 * download). Run: npm run verify:e2e [url]
 *
 * It always works in its own account and its own browser context: the dev database is
 * shared with a second session and with whatever the owner has open in his browser, so
 * nothing here may reuse a session token or touch rows it did not create.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:5199";
const OUT = new URL("./.shots/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 430, height: 932 },
];

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function shoot(page, label) {
  await page.screenshot({ path: fileURLToPath(new URL(`${label}.png`, OUT)), fullPage: false });
  return `${label}.png`;
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  // 1. The door: what an anonymous visitor gets.
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const problems = [];
    page.on("console", (m) => m.type() === "error" && problems.push(m.text().slice(0, 80)));
    page.on("requestfailed", (r) => problems.push(`net ${r.url().slice(-40)}`));
    page.on("response", (r) => r.status() >= 400 && problems.push(`http ${r.status()} ${new URL(r.url()).pathname}`));

    await page.goto(BASE, { waitUntil: "networkidle" });
    const file = await shoot(page, `login-${vp.name}`);
    const heading = await page.locator("h1").first().innerText().catch(() => "");
    check(`login renders (${vp.name})`, heading.length > 0, `${heading} → ${file}`);
    check(`login has no failed requests (${vp.name})`, problems.length === 0, problems.slice(0, 3).join(" | "));
    await ctx.close();
  }

  // 2. A brand-new account: the first screen a pilot student actually sees.
  const username = `e2e_${Date.now().toString(36).slice(-6)}`;
  const password = "e2e-password-1";
  const register = await (await fetch(`${BASE}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, external_ai_consent: false }),
  })).json();
  check("registered its own account", Boolean(register.token), username);

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const problems = [];
    page.on("response", (r) => r.status() >= 400 && problems.push(`http ${r.status()} ${new URL(r.url()).pathname}`));
    // Seed the token before the app boots, so it starts signed in as our own user.
    await page.addInitScript((token) => localStorage.setItem("career.session.token", token), register.token);
    await page.goto(BASE, { waitUntil: "networkidle" });
    const file = await shoot(page, `empty-${vp.name}`);
    const body = await page.evaluate(() => document.body.innerText.replace(/\s/g, "").length);
    const isLogin = await page.locator(".auth__wrap").count();
    check(`new account reaches the workspace (${vp.name})`, isLogin === 0 && body > 40, `${body} chars → ${file}`);
    check(`empty workspace makes no failing calls (${vp.name})`, problems.length === 0, problems.slice(0, 3).join(" | "));
    await ctx.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed; shots in web/e2e/.shots/`);
writeFileSync(new URL("last-run.json", OUT), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
process.exit(failed.length ? 1 : 0);
