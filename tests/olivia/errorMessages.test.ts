import { describe, it, expect } from "vitest";
import { normalizeToolError, OLIVIA_FALLBACK_MESSAGES } from "@/lib/olivia/output/errorMessages";

// 코드 요청서 — Olivia 채팅 안정성. 원본 에러(Postgres 코드, 스택트레이스 등)가 사용자에게
// 절대 그대로 노출되지 않아야 한다. logDetail에는 서버 로그용으로 원문을 남긴다.

describe("normalizeToolError — 원본 에러가 사용자 메시지로 절대 그대로 노출되지 않는다", () => {
  const rawErrors = [
    "PGRST116: The result contains 0 rows",
    "duplicate key value violates unique constraint \"clients_pkey\"",
    "insert or update on table violates foreign key constraint",
    "ETIMEDOUT: connection timed out",
    "no rows found for query",
    "permission denied for table clients",
    "at Object.<anonymous> (/app/lib/olivia/tools/calendar.ts:42:11)",
    '{"error":"internal server error","stack":"..."}',
  ];

  for (const raw of rawErrors) {
    it(`"${raw.slice(0, 40)}..." 는 사용자 메시지에 원문 그대로 안 나온다`, () => {
      const normalized = normalizeToolError(new Error(raw));
      expect(normalized.userMessage).not.toContain(raw);
      expect(normalized.userMessage).not.toMatch(/PGRST|violates|ETIMEDOUT|at Object|\.ts:\d+/);
    });

    it(`"${raw.slice(0, 40)}..." 의 원문은 logDetail에 그대로 남는다(서버 로그용)`, () => {
      const normalized = normalizeToolError(new Error(raw));
      expect(normalized.logDetail).toBe(raw);
    });
  }

  it("알 수 없는 에러 타입도 문자열로 안전하게 변환된다", () => {
    const normalized = normalizeToolError("plain string error");
    expect(normalized.logDetail).toBe("plain string error");
    expect(normalized.userMessage).toBeTruthy();
  });

  it("알려진 패턴도 없고 한글도 없는 정체불명 영문 에러는 지정한 fallback을 쓴다", () => {
    const normalized = normalizeToolError(new Error("Something totally unexpected happened in a dependency"), "커스텀 폴백 메시지");
    expect(normalized.userMessage).toBe("커스텀 폴백 메시지");
  });

  it("이미 한국어로 작성된 안전한 비즈니스 메시지는 그대로 통과시킨다(WP5 회귀 — quote 도메인 미지원 안내 등)", () => {
    const normalized = normalizeToolError(new Error(`"quote"은(는) 아직 챗에서 직접 생성·수정할 수 없는 기능이에요.`));
    expect(normalized.userMessage).toBe(`"quote"은(는) 아직 챗에서 직접 생성·수정할 수 없는 기능이에요.`);
  });
});

describe("OLIVIA_FALLBACK_MESSAGES — 내부 기능명을 사용자에게 강요하지 않는다", () => {
  it("featureNotFoundSoft는 '다른 기능명으로 말씀해주세요' 같은 강요 문구를 쓰지 않는다", () => {
    const message = OLIVIA_FALLBACK_MESSAGES.featureNotFoundSoft("존재하지않는기능");
    expect(message).not.toContain("정확한 기능명");
    expect(message).not.toContain("다른 기능명으로");
  });
});
