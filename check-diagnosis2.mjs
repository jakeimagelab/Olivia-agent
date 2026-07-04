import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
await page.goto("http://localhost:3000/diagnosis", { waitUntil: "networkidle" });

await page.getByText("곧 개원 예정").click();
await page.getByText("다음 →").click();

await page.getByText("병원이 전문적으로 보이지 않는다").click();
await page.getByText("다음 →").click();

await page.getByText("피부과", { exact: true }).click();
await page.getByText("다음 →").click();

await page.getByText("홈페이지", { exact: true }).click();
await page.getByText("다음 →").click();

// Step 5: budget (newly re-added)
const html5 = await page.content();
console.log("step5 has budget options:", html5.includes("300~500만 원"));
await page.getByText("300~500만 원").click();
await page.getByText("다음 →").click();

// Step 6: combined contact + photo
const html6 = await page.content();
console.log("step6 has contact fields:", html6.includes("병원명"));
console.log("step6 has photo upload:", html6.includes("현재 사용 중인 병원 사진"));

await page.getByPlaceholder("예: 참이지치과").fill("테스트병원");
await page.getByPlaceholder("010-0000-0000").fill("010-1234-5678");
await page.getByPlaceholder("example@hospital.com").fill("test@example.com");

await page.getByText("📋 진단 완료 · 결과 보기").click();
await page.waitForTimeout(500);

const resultHtml = await page.content();
console.log("reached result screen:", resultHtml.includes("진단 결과"));
console.log("packages shown:", (resultHtml.match(/Premium Plus|Homepage|Branding Content|Premium/g) || []));

await browser.close();
