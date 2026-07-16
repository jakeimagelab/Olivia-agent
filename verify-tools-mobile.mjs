import { chromium } from 'playwright';

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
await context.addCookies([
  { name: 'pc_admin_session', value: 'active', domain: 'localhost', path: '/' },
]);
const page = await context.newPage();
await page.goto('http://localhost:3020/admin/tools', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
const viewportWidth = await page.evaluate(() => window.innerWidth);
console.log('viewportWidth:', viewportWidth, 'bodyScrollWidth:', bodyWidth);

const overflowing = await page.evaluate(() => {
  const vw = window.innerWidth;
  const results = [];
  document.querySelectorAll('*').forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.right > vw + 2 || rect.width > vw + 2) {
      results.push({
        tag: el.tagName,
        cls: el.className && typeof el.className === 'string' ? el.className.slice(0, 100) : '',
        width: Math.round(rect.width),
        right: Math.round(rect.right),
      });
    }
  });
  return results.slice(0, 25);
});
console.log('overflowing elements:', JSON.stringify(overflowing, null, 2));

await page.screenshot({ path: 'verify-tools-mobile.png', fullPage: true });

await browser.close();
