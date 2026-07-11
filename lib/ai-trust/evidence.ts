import crypto from "crypto";
import { AI_TRUST_EVIDENCE_SCHEMAS } from "./constants";
import type { AiTrustEvidenceSchemaKey } from "./types";

export type EvidenceDocumentInput = {
  source_type: string;
  source_name: string;
  url: string;
  title: string;
  text: string;
  content_hash: string;
};

const SCHEMA_PATTERNS: Record<AiTrustEvidenceSchemaKey, RegExp[]> = {
  LOCATION_RELEVANCE: [/역|출구|도보|거리|주소|위치|주차|강남|서울|부산|대구|인근|근처/],
  INFORMATION_CLARITY: [/진료시간|소개|안내|전문|특징|클리닉|센터|프로그램/],
  DOCTOR_INFORMATION: [/원장|의료진|전문의|대표원장|경력|학회|약력|doctor|dr\./i],
  TREATMENT_INFORMATION: [/시술|진료|치료|리쥬란|써마지|울쎄라|보톡스|필러|임플란트|교정|검사/],
  REVIEW_EVIDENCE: [/후기|리뷰|평점|만족|추천|review/i],
  THIRD_PARTY_MENTIONS: [/언론|뉴스|기사|방송|매거진|플랫폼|커뮤니티|블로그|카페/],
  INFORMATION_CONSISTENCY: [/동일|일관|확인|공식|등록|인증/],
  FRESHNESS: [/202[3-9]|최근|신규|업데이트|이벤트|소식|공지/],
  VISUAL_EVIDENCE: [/사진|이미지|갤러리|공간|장비|상담|전후|before|after/i],
  MULTILINGUAL_INFORMATION: [/english|japanese|chinese|영어|일본어|중국어|외국인|multilingual/i],
  PRICE_INFORMATION: [/가격|비용|수가|이벤트|할인|원부터|만원|상담비/],
  BOOKING_ACCESSIBILITY: [/예약|상담|문의|전화|카카오|네이버 예약|온라인 예약|booking/i],
};

export async function fetchEvidenceUrl(url: string): Promise<EvidenceDocumentInput | null> {
  if (!/^https?:\/\//.test(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Olivia-AI-Trust-Gap/1.0; evidence collector",
      },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) return null;
    const html = await res.text();
    const text = extractText(html);
    if (!text || text.length < 80) return null;
    return {
      source_type: "AI_CITATION_URL",
      source_name: new URL(url).hostname,
      url,
      title: extractTitle(html) || url,
      text,
      content_hash: crypto.createHash("sha256").update(`${url}\n${text.slice(0, 5000)}`).digest("hex"),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function classifyEvidenceText(text: string) {
  const facts: { schema_key: AiTrustEvidenceSchemaKey; evidence_quote: string; interpretation: string; consistency: "LOW" | "MEDIUM" | "HIGH" }[] = [];
  const snippets = text.split(/[.!?\n。]/).map((item) => item.trim()).filter((item) => item.length > 18);
  AI_TRUST_EVIDENCE_SCHEMAS.forEach((schema) => {
    const patterns = SCHEMA_PATTERNS[schema.key] || [];
    const matched = snippets.find((snippet) => patterns.some((pattern) => pattern.test(snippet)));
    if (!matched) return;
    facts.push({
      schema_key: schema.key,
      evidence_quote: matched.slice(0, 600),
      interpretation: `${schema.label} 관련 근거가 확인되었습니다.`,
      consistency: "MEDIUM",
    });
  });
  return facts;
}

function extractTitle(html: string) {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() || "";
}

function extractText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30000);
}
