import { describe, expect, it } from "vitest";
import { getOliviaCrudCapabilities } from "@/lib/olivia/crud/registry";
import { validateOliviaCrudRequest } from "@/lib/olivia/crud/validation";
import { getOliviaCrudNavigation } from "@/lib/olivia/crud/executor";

describe("Olivia 기능별 생성·수정 검증", () => {
  it("지원 도메인과 허용 필드를 공개한다", () => {
    const capabilities = getOliviaCrudCapabilities();
    expect(capabilities.map((item) => item.domain)).toContain("client");
    expect(capabilities.find((item) => item.domain === "client")?.fields).toContain("hospitalName");
  });

  it("고객 생성의 알 수 없는 필드를 제거한다", () => {
    const result = validateOliviaCrudRequest({
      operation: "create",
      domain: "client",
      data: { hospitalName: " 오블리브의원 ", phone: "010-1234-5678", rawSql: "drop table clients" },
    });
    expect(result.data).toEqual({ hospitalName: "오블리브의원", phone: "010-1234-5678" });
    expect(result.data).not.toHaveProperty("rawSql");
  });

  it("생성 필수값이 없으면 차단한다", () => {
    expect(() => validateOliviaCrudRequest({ operation: "create", domain: "calendar", data: { memo: "촬영" } }))
      .toThrow(/date 값은 필수|title 값은 필수/);
  });

  it("수정 대상이 없으면 차단한다", () => {
    expect(() => validateOliviaCrudRequest({ operation: "update", domain: "client", data: { phone: "010" } }))
      .toThrow(/수정할 대상/);
  });

  it("평점과 상태 enum 범위를 검사한다", () => {
    expect(() => validateOliviaCrudRequest({ operation: "create", domain: "review", data: { hospitalName: "라셀의원", overallRating: 9 } }))
      .toThrow(/5 이하/);
    expect(() => validateOliviaCrudRequest({ operation: "create", domain: "mail_draft", data: { hospitalName: "라셀의원", subject: "안내", body: "본문", type: "unknown" } }))
      .toThrow(/허용 범위/);
  });

  it("숫자 문자열을 정규화하고 가격 필드를 owner only로 분류한다", () => {
    const result = validateOliviaCrudRequest({
      operation: "create",
      domain: "quote",
      data: { hospitalName: "라셀의원", totalAmount: "3,300,000" },
    });
    expect(result.data.totalAmount).toBe(3_300_000);
    expect(result.permission).toBe("owner_only");
  });

  it("일반 메모와 일정은 별도 도메인 필드를 가진다", () => {
    const memo = validateOliviaCrudRequest({ operation: "create", domain: "memo", data: { rawMemo: "고객이 따뜻한 톤을 원함", date: "2026-07-20" } });
    expect(memo.data).toEqual({ rawMemo: "고객이 따뜻한 톤을 원함" });
    const calendar = validateOliviaCrudRequest({ operation: "create", domain: "calendar", data: { date: "2026-07-20", title: "고객 미팅", rawMemo: "잘못된 필드" } });
    expect(calendar.data).toEqual({ date: "2026-07-20", title: "고객 미팅" });
  });

  it("고객 생성만 새 고객 상세 페이지로 이동한다", () => {
    expect(getOliviaCrudNavigation("client", "create", "client-123")).toBe("/clients?id=client-123");
    expect(getOliviaCrudNavigation("client", "update", "client-123")).toBeNull();
    expect(getOliviaCrudNavigation("quote", "create", "quote-123")).toBeNull();
  });
});
