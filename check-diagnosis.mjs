import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
await page.goto("http://localhost:3000/diagnosis", { waitUntil: "networkidle" });

// Step 1: stage
await page.getByText("곧 개원 예정").click();
await page.getByText("다음 →").click();

// Step 2: concerns (multi)
await page.getByText("병원이 전문적으로 보이지 않는다").click();
await page.getByText("다음 →").click();

// Step 3: department
await page.getByText("피부과", { exact: true }).click();
await page.getByText("다음 →").click();

// Step 4: usages (multi)
await page.getByText("홈페이지", { exact: true }).click();
await page.getByText("다음 →").click();

// Step 5: combined contact + photo upload
const html = await page.content();
console.log("has contact fields:", html.includes("병원명"));
console.log("has photo upload section:", html.includes("현재 사용 중인 병원 사진"));

await page.getByPlaceholder("예: 참이지치과").fill("테스트병원");
await page.getByPlaceholder("010-0000-0000").fill("010-1234-5678");
await page.getByPlaceholder("example@hospital.com").fill("test@example.com");

const progressText = await page.locator("text=/20%|100%/").allTextContents();
console.log("progress markers seen:", progressText);

await page.getByText("📋 진단 완료 · 결과 보기").click();
await page.waitForTimeout(500);

const resultHtml = await page.content();
console.log("reached result screen:", resultHtml.includes("진단 결과"));
console.log("diagnosis type shown:", (resultHtml.match(/개원 브랜딩형|신뢰 보완형|공간 이미지 강화형|진료 장면 설계형|콘텐츠 확장형/) || [])[0]);

await browser.close();
