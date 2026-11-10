import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mergeClinicCandidates, normalizeClinicName, type ClinicCandidate } from "@/lib/ai-trust/clinics";
import { calculateAiTrustCost, DEFAULT_PRICING, estimateAiTrustRunCost } from "@/lib/ai-trust/costs";
import { matchHospitalMention } from "@/lib/ai-trust/entities";
import { aiQueryJobKey, retryDelayMs } from "@/lib/ai-trust/jobs";
import { generateGeoRadarPrompts } from "@/lib/ai-trust/prompts";
import { getAiTrustProviderStatuses } from "@/lib/ai-trust/providers";
import { resolveWorkspaceGroupForLocation } from "@/lib/workspaceGroups";

function clinic(overrides: Partial<ClinicCandidate> = {}): ClinicCandidate {
  return {
    canonical_name: "글로리의원",
    normalized_name: normalizeClinicName("글로리의원"),
    clinic_type: "의원",
    department_code: "14",
    address: "서울 강남구 봉은사로 207",
    latitude: 37.507287,
    longitude: 127.033868,
    district: "강남구",
    website: null,
    phone: "02-123-4567",
    source: "hira",
    source_id: "hira-glory",
    source_payload: {},
    ...overrides,
  };
}

describe("GEO 레이더 질문과 비용", () => {
  it("12개 한국어 질문과 필요한 유형을 만든다", () => {
    const prompts = generateGeoRadarPrompts({
      keywords: ["언주역", "논현동"],
      region: "언주역 부근",
      department: "피부과",
      treatments: ["울쎄라"],
    });
    expect(prompts).toHaveLength(12);
    expect(new Set(prompts.map((prompt) => prompt.intent))).toEqual(
      new Set(["LOCATION", "RECOMMENDATION", "TREATMENT", "PRICE", "TRUST", "CONDITION"]),
    );
    expect(prompts.every((prompt) => prompt.language === "ko" && prompt.question.includes("언주역"))).toBe(true);
  });

  it("토큰과 검색 호출 비용을 분리해 계산한다", () => {
    expect(calculateAiTrustCost({
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      webSearchCount: 2,
      pricing: { input_per_million: 2, output_per_million: 10, web_search: 0.01 },
    })).toBe(7.02);
    expect(estimateAiTrustRunCost({ requestCount: 10, providers: ["openai"], pricing: DEFAULT_PRICING })).toBeGreaterThan(0);
    expect(estimateAiTrustRunCost({ requestCount: 10, providers: [], pricing: DEFAULT_PRICING })).toBe(0);
  });
});

describe("GEO 레이더 병원 데이터", () => {
  it("HIRA 병원에 카카오 홈페이지와 좌표를 보완한다", () => {
    const merged = mergeClinicCandidates(
      [clinic()],
      [clinic({ source: "kakao", source_id: "kakao-glory", website: "https://place.map.kakao.com/1", latitude: 37.5, longitude: 127.03 })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].website).toBe("https://place.map.kakao.com/1");
    expect(merged[0].source).toBe("hira");
  });

  it("출처 도메인이 같은 정확한 병원명을 자동 매칭한다", () => {
    const matched = matchHospitalMention({
      raw_name: "글로리 의원",
      rank: 2,
      mention_context: "RECOMMENDED",
      snippet: "글로리의원을 추천합니다.",
      confidence: 0.9,
      source_url: "https://glory.example/doctor",
    }, [{
      id: "clinic-1",
      canonical_name: "글로리의원",
      normalized_name: normalizeClinicName("글로리의원"),
      website: "https://glory.example",
    }]);
    expect(matched.status).toBe("MATCHED");
    expect(matched.clinic?.id).toBe("clinic-1");
  });
});

describe("GEO 레이더 운영 안전장치", () => {
  it("작업 키와 재시도 간격이 결정적이다", () => {
    expect(aiQueryJobKey("run", "prompt", "openai", 2)).toBe("ai_query:run:prompt:openai:2");
    expect([retryDelayMs(1), retryDelayMs(2), retryDelayMs(3)]).toEqual([60_000, 300_000, 1_800_000]);
  });

  it("Provider 상태는 실제 키 존재 여부만 반영한다", () => {
    const original = process.env.PERPLEXITY_API_KEY;
    try {
      delete process.env.PERPLEXITY_API_KEY;
      expect(getAiTrustProviderStatuses().find((item) => item.provider === "perplexity")?.note).toBe("키 없음");
      process.env.PERPLEXITY_API_KEY = "test-key";
      expect(getAiTrustProviderStatuses().find((item) => item.provider === "perplexity")?.note).toBe("연결됨");
    } finally {
      if (original === undefined) delete process.env.PERPLEXITY_API_KEY;
      else process.env.PERPLEXITY_API_KEY = original;
    }
  });

  it("GEO 레이더는 브랜드 그룹과 분리된 독립 앱이다", () => {
    expect(resolveWorkspaceGroupForLocation("/geo-radar")).toBeNull();
    expect(resolveWorkspaceGroupForLocation("/ai-trust-gap")).toBeNull();
  });

  it("확장 SQL은 선행 순서와 서버 전용 RLS를 명시하며 삭제하지 않는다", () => {
    const sql = readFileSync("supabase/geo-radar-v1.sql", "utf8");
    expect(sql.indexOf("supabase/ai-trust-gap-schema.sql")).toBeLessThan(sql.indexOf("supabase/geo-radar-v1.sql"));
    expect(sql).toContain("create table if not exists ai_trust_jobs");
    expect(sql).toContain("alter table ai_trust_jobs enable row level security");
    expect(sql).toContain("revoke all on table ai_trust_jobs from anon, authenticated");
    expect(sql).not.toMatch(/\bdrop\s+table\b|\btruncate\b|\bdelete\s+from\b/i);
  });
});
