/**
 * Screenshot matrix and console check, driven by the installed Chrome (no browser
 * download). Run: npm run verify:e2e [url]
 *
 * It signs in as one fixed fixture account rather than registering a new one per run,
 * so the dev database does not accumulate a user every time someone looks at the UI.
 * The fixture is read-only by contract: this script must never create runs, projects or
 * rows under it, or the screenshots stop being comparable between runs. The dev database
 * is shared with a second session, so nothing here may touch any other account.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:5199";
const FIXTURE = { username: "e2e_probe", password: "e2e-probe-password-1", external_ai_consent: false };
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

/**
 * Labels that wrap to one character per line — the shape a four-character button gets
 * when it is given a 32px slot. Computed-style普查 (radius, colour, contrast) never sees
 * this, and both times it happened it was found by a screenshot, so it is checked here.
 * A line box is one client rect of the text range; an element is an offender only when
 * every line is about one glyph wide, which a normal wrapped paragraph never is.
 */
const WIDE_ENOUGH = 1.9;
async function wrappedLabels(page) {
  return page.evaluate((ratio) => {
    const offenders = [];
    let scanned = 0;
    // Text nodes, not elements: the button that broke was a label sharing its box with
    // an icon span, so an element-level walk would skip it for having children.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent || "").replace(/\s+/g, "");
      if (text.length < 2) continue;
      const host = node.parentElement;
      if (!host || host.closest("script, style")) continue;
      const size = parseFloat(getComputedStyle(host).fontSize) || 16;
      const range = document.createRange();
      range.selectNodeContents(node);
      const lines = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
      const box = host.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;
      scanned += 1;
      // Both halves matter: a normal paragraph can end on a one-character line, but it
      // will never have as many lines as it has characters.
      const oneGlyphWide = lines.length >= 2 && lines.every((r) => r.width < size * ratio);
      if (oneGlyphWide && lines.length >= Math.ceil(text.length * 0.6)) {
        offenders.push(`${host.tagName.toLowerCase()}.${(host.className || "").split(" ")[0]} "${text.slice(0, 8)}" ${Math.round(box.width)}px/${lines.length}行`);
      }
    }
    return { offenders: offenders.slice(0, 4), scanned };
  }, WIDE_ENOUGH);
}

/** The composer's two competing claims on a phone's width, in px. */
async function composerWidths(page) {
  return page.evaluate(() => {
    const w = (sel) => Math.round(document.querySelector(sel)?.getBoundingClientRect().width ?? 0);
    return { input: w("#composer"), picker: w(".picker") };
  });
}

/** Two samples of the animated transform, far enough apart that a moving layer differs. */
async function fieldDrift(page) {
  const read = () => page.evaluate(() => getComputedStyle(document.querySelector(".field__wave")).transform);
  const before = await read();
  await page.waitForTimeout(600);
  const after = await read();
  return { before, after, moved: before !== after };
}

/** Log the fixture in; only the very first run on an empty database creates it. */
async function fixtureToken() {
  const post = async (path, body) => {
    const r = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  };
  const login = await post("/api/v1/auth/login", { username: FIXTURE.username, password: FIXTURE.password });
  if (login.json.token) {
    return { token: login.json.token, created: false, detail: "login reused" };
  }
  const register = await post("/api/v1/auth/register", FIXTURE);
  return { token: register.json.token, created: true, detail: `login ${login.status} → register ${register.status}` };
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  // 0. Prove the wrap detector can go red. A guard that has never fired on purpose is
  //    the same as no guard — this is the only reason its PASS on a real page means anything.
  {
    const page = await browser.newPage();
    await page.setContent(`
      <div style="font-size:13px;width:430px">
        <button style="width:32px;padding:0 8px;font-size:13px"><span>研究员视图</span></button>
        <div style="width:400px">研究员视图：要写进业务库的动作会停下来等你确认，这样你看到的每一句都能追到原话。</div>
      </div>`);
    const probe = await wrappedLabels(page);
    check(
      "wrap detector fires on a squeezed label and spares a wrapped paragraph",
      probe.offenders.length === 1,
      `${probe.offenders.join(" | ")} — ${probe.scanned} text nodes scanned`,
    );
    await page.close();
  }

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
    check(`login talks about job seeking (${vp.name})`, /求职|简历/.test(heading), heading);
    check(`login has no failed requests (${vp.name})`, problems.length === 0, problems.slice(0, 3).join(" | "));
    const wrapped = await wrappedLabels(page);
    check(
      `login labels stay horizontal (${vp.name})`,
      wrapped.offenders.length === 0,
      wrapped.offenders.length ? wrapped.offenders.join(" | ") : `${wrapped.scanned} text nodes scanned`,
    );
    await ctx.close();
  }

  // 2. The fixture account: the first screen a pilot student actually sees.
  const fixture = await fixtureToken();
  check("signed in as the fixture account", Boolean(fixture.token), `${FIXTURE.username} — ${fixture.detail}`);

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const problems = [];
    const cdn = [];
    page.on("response", (r) => r.status() >= 400 && problems.push(`http ${r.status()} ${new URL(r.url()).pathname}`));
    // The webfonts are vendored; a request to a third-party font host means either the
    // CDN crept back into index.html or something added a remote @font-face.
    page.on("request", (r) => /fonts\.(googleapis|gstatic)\.com/.test(r.url()) && cdn.push(r.url()));
    // Seed the token before the app boots, so it starts signed in as our own user.
    await page.addInitScript((token) => {
      localStorage.setItem("career.session.token", token);
      localStorage.removeItem("career.research");
    }, fixture.token);
    await page.goto(BASE, { waitUntil: "networkidle" });
    const file = await shoot(page, `empty-${vp.name}`);
    const body = await page.evaluate(() => document.body.innerText.replace(/\s/g, "").length);
    const isLogin = await page.locator(".auth__wrap").count();
    check(`fixture lands on the workspace (${vp.name})`, isLogin === 0 && body > 40, `${body} chars → ${file}`);
    const welcomeCount = await page.locator(".welcome").count();
    const spineCount = await page.locator(".spine").count();
    check(
      `first screen greets a job seeker (${vp.name})`,
      welcomeCount === 1 && spineCount === 0,
      `welcome ${welcomeCount} spine ${spineCount}`,
    );
    const welcomeText = await page.locator(".welcome").innerText().catch(() => "");
    check(`greeting offers a resume (${vp.name})`, welcomeText.includes("写一份简历"), welcomeText.slice(0, 48));
    check(`greeting offers job match (${vp.name})`, welcomeText.includes("对照岗位"), welcomeText.slice(0, 48));
    const chrome = await page.locator(".app").innerText();
    check(
      `researcher chrome stays off (${vp.name})`,
      !chrome.includes("研究员") && !chrome.includes("这一轮走到哪") && !chrome.includes("新建规划会话"),
      chrome.includes("研究员") ? "研究员" : chrome.includes("这一轮走到哪") ? "五步轨道" : "",
    );
    const widths = await composerWidths(page);
    check(
      `the input out-widths the capability chip (${vp.name})`,
      widths.input > widths.picker,
      `输入 ${widths.input}px vs 能力下拉 ${widths.picker}px`,
    );
    check(`workspace makes no failing calls (${vp.name})`, problems.length === 0, problems.slice(0, 3).join(" | "));
    check(`nothing is fetched from a font CDN (${vp.name})`, cdn.length === 0, cdn.slice(0, 2).join(" | "));
    // The shipped icon font is a subset, so its failure mode is an icon drawing its own
    // name as words. Every substituted ligature measures exactly 1em here (24 of them,
    // min=median=max), while the same string in a text font runs 6–17em — 1.6 sits far
    // from both. The control proves the detector still bites: same text, icon font taken
    // away, and the check must see it.
    const icons = await page.evaluate(() => {
      const em = (el) => el.getBoundingClientRect().width / (parseFloat(getComputedStyle(el).fontSize) || 24);
      const offenders = [...document.querySelectorAll(".ms")]
        .filter((el) => (el.textContent || "").trim().length > 1 && em(el) > 1.6)
        .map((el) => el.textContent.trim());
      const probe = Object.assign(document.createElement("span"), { className: "ms", textContent: "arrow_upward" });
      probe.style.fontFamily = "serif";
      document.body.appendChild(probe);
      const control = +em(probe).toFixed(1);
      probe.remove();
      return { offenders, control, seen: document.querySelectorAll(".ms").length };
    });
    check(
      `no icon draws its own name as text (${vp.name})`,
      icons.offenders.length === 0 && icons.control > 1.6,
      icons.offenders.length ? icons.offenders.slice(0, 3).join(" | ") : `${icons.seen} 个图标 · 对照 ${icons.control}em`,
    );
    const wrapped = await wrappedLabels(page);
    check(
      `workspace labels stay horizontal (${vp.name})`,
      wrapped.offenders.length === 0,
      wrapped.offenders.length ? wrapped.offenders.join(" | ") : `${wrapped.scanned} text nodes scanned`,
    );

    if (vp.name === "desktop") {
      // A background that silently stopped animating still photographs fine, so the
      // only proof worth having is two samples of the transform a moment apart — and
      // the same pair taken with the switch off, which must NOT differ.
      const drift = await fieldDrift(page);
      const x = (matrix) => matrix.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*(-?[\d.]+)/)?.[1] ?? matrix;
      check("the field drifts while she is idle", drift.moved, `x ${x(drift.before)}px → ${x(drift.after)}px`);
      const stopped = await page.evaluate(async () => {
        document.querySelector(".app").setAttribute("data-motion", "off");
        const read = () => getComputedStyle(document.querySelector(".field__wave")).transform;
        // Give the style recalc a beat. Reading in the same task as the attribute write
        // returns the pre-pause value, and the two samples then differ for the wrong
        // reason — which is exactly how this check first reported a false red.
        await new Promise((done) => setTimeout(done, 200));
        const first = read();
        await new Promise((done) => setTimeout(done, 600));
        const second = read();
        // Restore only after both samples are in hand — writing the attribute and
        // reading in the same task is what made this check lie the other way.
        document.querySelector(".app").setAttribute("data-motion", "on");
        return { first, second };
      });
      check("the menu switch really stops it", stopped.first === stopped.second, x(stopped.second));

      const rim = await page.evaluate(async () => {
        // `::before` is not a node — querySelector returns null for it, which threw here
        // before it ever compared anything. Pseudo styles need the two-argument form.
        const read = () => getComputedStyle(document.querySelector(".dock__glow"), "::before").rotate;
        const first = read();
        await new Promise((done) => setTimeout(done, 600));
        return { first, second: read() };
      });
      check("the composer rim travels", rim.first !== rim.second, `rotate ${rim.first} → ${rim.second}`);

      const lit = await page.evaluate(async () => {
        const read = () => getComputedStyle(document.querySelector(".dock__glow")).opacity;
        const dim = read();
        document.getElementById("composer").focus();
        await new Promise((done) => setTimeout(done, 400));
        return { dim, lit: read() };
      });
      check("the rim brightens when the box has focus", Number(lit.lit) > Number(lit.dim), `${lit.dim} → ${lit.lit}`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed; shots in web/e2e/.shots/`);
writeFileSync(new URL("last-run.json", OUT), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
process.exit(failed.length ? 1 : 0);
