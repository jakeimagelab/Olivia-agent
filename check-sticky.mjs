import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3000/quote", { waitUntil: "networkidle" });
await page.waitForTimeout(600); // let the 320ms mount fade-in animation fully finish

const aside = await page.$("aside");
if (!aside) {
  console.log("NO ASIDE FOUND");
  process.exit(1);
}

const before = await aside.boundingBox();
console.log("before scroll:", JSON.stringify(before));

await page.evaluate(() => window.scrollTo(0, 600));
await page.waitForTimeout(300);

const after = await aside.boundingBox();
console.log("after scroll 600px:", JSON.stringify(after));

// check computed overflow chain
const info = await page.evaluate(() => {
  const aside = document.querySelector("aside");
  const results = [];
  let el = aside;
  while (el) {
    const cs = getComputedStyle(el);
    results.push({ tag: el.tagName, cls: el.className?.toString().slice(0,60), position: cs.position, overflow: cs.overflow, overflowY: cs.overflowY, overflowX: cs.overflowX, transform: cs.transform });
    el = el.parentElement;
  }
  return results;
});
console.log(JSON.stringify(info, null, 2));

await browser.close();
