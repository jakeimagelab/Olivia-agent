import { chromium } from 'playwright';

const pages = [
  ['admin-tools', '/admin/tools'],
  ['photo-sorting', '/photo-sorting'],
  ['select-match', '/select-match'],
  ['conti', '/conti'],
  ['memo', '/memo'],
  ['marketing', '/marketing'],
  ['per-clients', '/per/clients'],
  ['clients', '/clients'],
  ['review-studio', '/review-studio'],
  ['calendar', '/calendar'],
];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

for (const [name, path] of pages) {
  try {
    await page.goto(`http://localhost:3000${path}`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `/private/tmp/claude-501/-Users-jakembpm2-UGnasync-Cloade-Olivia-agent-main/bcce6910-3ad3-4d5e-85a0-ff76713bfb04/scratchpad/shots/${name}.png` });
    console.log(`OK: ${name}`);
  } catch (e) {
    console.log(`FAIL: ${name} - ${e.message}`);
  }
}

await browser.close();
