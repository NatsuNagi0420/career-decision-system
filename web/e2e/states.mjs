/**
 * Visual review of loop states we cannot produce locally right now.
 *
 * These shots stub `/api/v1/feed`; nothing is written to the shared database and no run
 * is started. That is also why every file is named `-stub-` — a screenshot from here
 * shows what a state LOOKS like, and is never evidence that the state happened.
 *
 * Run: node e2e/states.mjs [url]
 */
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:5199";
const FIXTURE = { username: "e2e_probe", password: "e2e-probe-password-1" };
const OUT = new URL("./.shots/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const artifact = (type, quoteCount = 0) => ({
  id: `a-${type}`,
  run_id: "stub-run",
  artifact_type: type,
  title: `${type} 标题`,
  status: "committed",
  version: 1,
  data_coverage: null,
  is_provisional: false,
  generation_mode: "stub",
  content: {},
  evidence_quotes: Object.fromEntries(Array.from({ length: quoteCount }, (_, i) => [String(i), "岗位要求原句示例"])),
  source_refs: [],
  supersedes_id: null,
});

const feed = (over = {}) => ({
  runs: [],
  projects: [],
  artifacts: [],
  obligations: [],
  tasks: [],
  pending_approvals: [],
  ...over,
});

const STATES = {
  "mid-loop": feed({
    artifacts: [artifact("ProfileGapReport"), artifact("JobMatchReport", 4)],
  }),
  "near-end": feed({
    artifacts: [artifact("ProfileGapReport"), artifact("JobMatchReport", 6), artifact("LearningPathDraft"), artifact("ResumeDraft")],
  }),
};

const login = await fetch(`${BASE}/api/v1/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(FIXTURE),
});
const token = (await login.json()).token;
if (!token) {
  console.error("no token — is the dev server and 8100 up?");
  process.exit(1);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const [label, stub] of Object.entries(STATES)) {
  for (const vp of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 430, height: 932 },
  ]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    await page.addInitScript((value) => {
      localStorage.setItem("career.session.token", value);
      localStorage.setItem("career.research", "1");
    }, token);
    await page.route("**/api/v1/feed", (route) => route.fulfill({ json: stub }));
    await page.goto(BASE, { waitUntil: "networkidle" });
    const file = `spine-stub-${label}-${vp.name}.png`;
    await page.screenshot({ path: fileURLToPath(new URL(file, OUT)) });
    console.log(`  wrote ${file}`);
    await ctx.close();
  }
}
await browser.close();
