import { describe, expect, it } from "vitest";
import { categorizeByTitle } from "@/lib/calendarCategorize";

describe("calendar title keyword categorization", () => {
  it("촬영이 들어가면 shooting", () => {
    expect(categorizeByTitle("김민지 웨딩촬영")).toBe("shooting");
    expect(categorizeByTitle("OOOO촬영")).toBe("shooting");
  });

  it("미팅/상담/고객이 들어가면 client", () => {
    expect(categorizeByTitle("허태경 대표님 미팅")).toBe("client");
    expect(categorizeByTitle("신규 고객 상담")).toBe("client");
  });

  it("회의/정산/세금 등 행정 키워드는 admin", () => {
    expect(categorizeByTitle("월말 정산 회의")).toBe("admin");
    expect(categorizeByTitle("부가세 신고")).toBe("admin");
  });

  it("개인/휴가/병원 등은 personal", () => {
    expect(categorizeByTitle("개인 병원 예약")).toBe("personal");
  });

  it("매칭되는 키워드가 없으면 general", () => {
    expect(categorizeByTitle("장비 점검")).toBe("general");
  });

  it("빈 제목은 general", () => {
    expect(categorizeByTitle("   ")).toBe("general");
  });

  it("여러 카테고리 키워드가 섞이면 shooting을 최우선으로 판정한다", () => {
    expect(categorizeByTitle("촬영 후 고객 미팅")).toBe("shooting");
  });
});
