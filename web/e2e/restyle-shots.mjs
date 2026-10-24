/**
 * One-off visual check for the cream-paper restyle. Signs in as fixtures, never
 * starts a run, never toggles researcher view.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:5173";
const OUT = new URL("../../logs/ui-restyle-20261013/shots/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const EMPTY = { username: "e2e_probe", password: "e2e-probe-password-1" };
const DEMO = { username: "demo_30217", password: "demo-password-1" };

async function token(user) {
  const r = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(user),
  });
  const json = await r.json().catch(() => ({}));
  if (!json.token) throw new Error(`login failed for ${user.username}: ${r.status} ${JSON.stringify(json)}`);
  return json.token;
}

async function shoot(page, name) {
  await page.waitForTimeout(600);
  const path = new URL(`${name}.png`, OUT);
  await page.screenshot({ path: fileURLToPath(path), fullPage: false });
  return path.pathname;
}

const notes = [];
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.locator(".auth__art img").waitFor({ state: "visible" });
    const paper = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    notes.push(`login paper ${paper}`);
    await shoot(page, "01-login-desktop");
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 } });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    await shoot(page, "01b-login-mobile");
    await ctx.close();
  }

  const emptyToken = await token(EMPTY);
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.addInitScript((t) => {
      localStorage.setItem("career.session.token", t);
      localStorage.removeItem("career.research");
      localStorage.setItem("career.motion", "1");
    }, emptyToken);
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.locator(".welcome h1").waitFor({ state: "visible" });
    const radius = await page.evaluate(() => getComputedStyle(document.querySelector(".welcome__card")).borderRadius);
    notes.push(`welcome card radius ${radius}`);
    await shoot(page, "02-welcome-empty-desktop");
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 } });
    const page = await ctx.newPage();
    await page.addInitScript((t) => {
      localStorage.setItem("career.session.token", t);
      localStorage.removeItem("career.research");
    }, emptyToken);
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.locator(".welcome h1").waitFor({ state: "visible" });
    await shoot(page, "02b-welcome-empty-mobile");
    await ctx.close();
  }

  const demoToken = await token(DEMO);
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.addInitScript((t) => {
      localStorage.setItem("career.session.token", t);
      localStorage.removeItem("career.research");
      localStorage.setItem("career.motion", "1");
    }, demoToken);
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await shoot(page, "03-thread-demo-desktop");
    await ctx.close();
  }
} finally {
  await browser.close();
}

writeFileSync(new URL("../notes.txt", OUT), notes.join("\n") + "\n", "utf8");
console.log(notes.join("\n"));
console.log("shots in logs/ui-restyle-20261013/shots/");
