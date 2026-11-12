import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(4000);
await page.screenshot({ path: 'D:/Project/career-decision-system/tmp/app-current.png' });
console.log(await page.title());
console.log((await page.locator('body').innerText()).slice(0, 2500));
await browser.close();
