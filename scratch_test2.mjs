import { chromium } from "playwright-core";

const base = "http://localhost:3002";
const target = process.argv[2];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const logs = [];
page.on("console", (msg) => logs.push(`[console.${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => logs.push(`[pageerror] ${err.message}`));
page.on("requestfailed", (req) => logs.push(`[requestfailed] ${req.url()} ${req.failure()?.errorText}`));

// 진짜 같은 오리진에서 시작(빈 페이지 대신 실제 앱의 아무 페이지)해서 LegacyRouteWindowContent와
// 최대한 비슷한 조건으로 iframe을 심는다.
await page.goto(base + "/", { waitUntil: "domcontentloaded" }).catch(() => {});
await page.waitForTimeout(1000);
await page.evaluate((src) => {
  const iframe = document.createElement("iframe");
  iframe.id = "test-frame";
  iframe.style.cssText = "position:fixed;inset:0;width:100%;height:100%;border:0;z-index:99999;background:#fff";
  iframe.src = src;
  iframe.setAttribute("allow", "clipboard-read; clipboard-write; microphone; camera");
  document.body.appendChild(iframe);
}, target);

const frameHandle = await page.waitForSelector("#test-frame");
const frame = await frameHandle.contentFrame();
await frame.waitForLoadState("networkidle", { timeout: 15000 }).catch((e) => logs.push(`[frame-load-timeout] ${e.message}`));
await page.waitForTimeout(2000);

const btnCount = await frame.locator("button:has-text('폴더')").count();
logs.push(`[info] iframe 안 '폴더' 버튼 개수: ${btnCount}`);
const bodyText = await frame.locator("body").innerText().catch((e) => `(읽기 실패: ${e.message})`);
logs.push(`[info] iframe body 텍스트 앞부분: ${bodyText.slice(0, 200).replace(/\n+/g, " | ")}`);

if (btnCount > 0) {
  try {
    await frame.locator("button:has-text('폴더')").first().click({ timeout: 3000 });
    logs.push("[info] 클릭 성공(예외 없음)");
  } catch (e) {
    logs.push(`[info] 클릭 실패: ${e.message}`);
  }
}
await page.waitForTimeout(1000);

console.log(logs.join("\n"));
await browser.close();
