import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const home = readFileSync("components/person-select/PersonSelectHome.tsx", "utf8");
const shared = readFileSync("components/person-select/SharedProjectSelect.tsx", "utf8");
const header = readFileSync("components/person-select/PersonSelectCustomerStageHeader.tsx", "utf8");
const review = readFileSync("components/person-select/PersonSelectDeliveryReview.tsx", "utf8");
const order = readFileSync("components/person-select/PersonSelectOrder.tsx", "utf8");

describe("person select staged customer UI", () => {
  it("uses one three-step header instead of original/delivery tabs", () => {
    expect(header).toContain('label: "사진 고르기"');
    expect(header).toContain('label: "보정본 확인"');
    expect(header).toContain('label: "다운로드"');
    expect(home).not.toContain("PersonSelectCustomerTabs");
    expect(shared).not.toContain("PersonSelectCustomerTabs");
  });

  it("derives both individual and shared screens from the common stage resolver", () => {
    expect(home).toContain("resolvePersonSelectCustomerStage");
    expect(shared).toContain("resolvePersonSelectCustomerStage");
    expect(home).toContain('mode={viewingStage === 3 ? "download" : "review"}');
    expect(shared).toContain('mode={viewingStage === 3 ? "download" : "review"}');
  });

  it("keeps delivery review and download as separate stage layouts", () => {
    expect(review).toContain('mode = "review"');
    expect(review).toContain("downloadGrid");
    expect(review).toContain("원본과 비교");
    expect(review).toContain("수정 요청 보내기");
    expect(review).toContain("최종 확인");
  });

  it("hides offers and rejects the direct screen while offers are closed", () => {
    expect(header).toContain("offersOpen && offersHref");
    expect(home).toContain("me.event.offers_open === true");
    expect(order).toContain("me.event.offers_open !== true");
    expect(order).toContain("지금은 액자·앨범 신청을 받지 않아요");
  });
});
