import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

for (const path of ["/", "/quote", "/photo-sorting", "/conti", "/video-conti", "/memo"]) {
  await page.goto(`http://localhost:3000${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  const widths = await page.evaluate(() => ({
    docScrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    hasHScroll: document.documentElement.scrollWidth > window.innerWidth,
  }));
  console.log(path, JSON.stringify(widths));
}

await browser.close();
