import { chromium } from "playwright-core";

async function run(label, url, opts = {}) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const logs = [];
  page.on("console", (msg) => logs.push(`[console.${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (err) => logs.push(`[pageerror] ${err.message}`));

  let target = page;
  if (opts.iframe) {
    await page.goto("about:blank");
    await page.setContent(`<html><body style="margin:0"><iframe id="f" style="width:100%;height:1000px;border:0" src="${url}"></iframe></body></html>`);
    const frameHandle = await page.waitForSelector("#f");
    target = await frameHandle.contentFrame();
    await target.waitForLoadState("networkidle").catch(() => {});
  } else {
    await page.goto(url, { waitUntil: "networkidle" });
  }
  await page.waitForTimeout(1500);

  // classification 탭으로 이동 (mode=classification)
  // 폴더 선택 버튼 텍스트를 찾아서 클릭
  const btn = target.locator("button:has-text('폴더')").first();
  const btnCount = await target.locator("button:has-text('폴더')").count();
  logs.push(`[info] 폴더 버튼 개수: ${btnCount}`);
  if (btnCount > 0) {
    try {
      await btn.click({ timeout: 3000 });
      logs.push("[info] 클릭 성공(예외 없음)");
    } catch (e) {
      logs.push(`[info] 클릭 실패: ${e.message}`);
    }
  }
  await page.waitForTimeout(1000);

  console.log(`\n=== ${label} ===`);
  console.log(logs.join("\n"));
  await browser.close();
}

const url = process.argv[2];
await run("TOP-LEVEL (no iframe)", url);
await run("INSIDE IFRAME", url, { iframe: true });
