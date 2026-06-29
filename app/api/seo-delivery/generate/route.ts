import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RISKY_WORDS = [
  "최고","유일","1위","완치","보장","확실한","통증완전해결","부작용없음","전후비교",
  "확실히","반드시","무조건","100%","완벽","탁월한효과","놀라운","기적","혁신적",
];

function sanitizeFileName(s: string): string {
  return s
    .replace(/\s+/g, "-")
    .replace(/[^\w\-가-힣]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function checkMedicalRisk(text: string): {
  riskLevel: "safe" | "caution" | "danger";
  riskyPhrases: string[];
  reasons: string[];
} {
  const found = RISKY_WORDS.filter((w) => text.replace(/\s/g, "").includes(w.replace(/\s/g, "")));
  if (found.length === 0) return { riskLevel: "safe", riskyPhrases: [], reasons: [] };
  const isDanger = found.some((w) => ["완치","보장","1위","최고","100%"].includes(w));
  return {
    riskLevel: isDanger ? "danger" : "caution",
    riskyPhrases: found,
    reasons: found.map((w) => `"${w}" — 의료광고법상 효과 단정·과장 표현`),
  };
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY 미설정" }, { status: 500 });

  const body = await req.json();
  const {
    hospitalName,
    department,
    region,
    shootingPurpose,
    mainKeywords = [],
    images = [],
  } = body as {
    hospitalName: string;
    department: string;
    region?: string;
    shootingPurpose?: string;
    mainKeywords?: string[];
    images: {
      originalFileName: string;
      sceneType?: string;
      sceneDisplayName?: string;
      department?: string;
      imageRole?: string;
    }[];
  };

  if (!hospitalName || !department) {
    return NextResponse.json({ ok: false, error: "병원명, 진료과는 필수입니다." }, { status: 400 });
  }
  if (!images.length) {
    return NextResponse.json({ ok: false, error: "이미지 목록이 비어있습니다." }, { status: 400 });
  }

  const systemPrompt = `당신은 병원 의료사진 SEO 전문가입니다.
병원 사진 납품 시 각 이미지에 대한 SEO 파일명, ALT 문구, 캡션, 설명, 키워드를 생성합니다.

반드시 지켜야 할 의료광고 안전 원칙:
- 효과 보장 표현 금지 (완치, 보장, 확실한 효과, 통증 완전 해결 등)
- 최고/유일/1위 표현 금지
- 치료 결과 단정 금지
- 환자 후기처럼 보이는 표현 금지
- 전후 비교 유도 금지
- 부작용 없음 표현 금지
- 진료 과정, 설명, 장비, 공간, 의료진 역할 중심으로 작성

권장 표현:
- 의료진이 환자에게 진료 과정을 설명하는 장면
- 장비를 활용한 진료 장면
- 의료진과 직원의 응대 장면
- 병원의 공간과 진료 환경

SEO 파일명 규칙:
- 형식: 진료과-장면유형-키워드-지역병원키워드-번호.jpg
- 하이픈으로 구분, 특수문자 금지, 60자 내외
- 한글 사용 가능, 소문자

각 이미지에 대해 JSON 배열로 반환하세요. 다른 텍스트 없이 순수 JSON만 출력:
[
  {
    "index": 0,
    "seoFileName": "진료과-장면유형-키워드-01.jpg",
    "title": "이미지 제목",
    "altText": "ALT 문구 (자연스러운 한 문장)",
    "caption": "캡션 (홈페이지/블로그/SNS 업로드용, 2-3문장)",
    "description": "설명문 (IPTC description, 1-2문장)",
    "keywords": ["키워드1", "키워드2", "키워드3"],
    "recommendedPageSection": "추천 업로드 위치 (예: 메인 배너, 의료진 소개, 시술 안내)",
    "recommendedUse": ["homepage", "blog"]
  }
]`;

  const userContent = `병원명: ${hospitalName}
진료과: ${department}
지역: ${region || "미지정"}
촬영 목적: ${shootingPurpose || "홈페이지/SNS 홍보"}
주요 키워드: ${mainKeywords.join(", ") || "없음"}

이미지 목록 (${images.length}장):
${images.map((img, i) =>
  `${i + 1}. 파일명: ${img.originalFileName} | 장면: ${img.sceneDisplayName || img.sceneType || "일반"} | 진료과: ${img.department || department} | 용도: ${img.imageRole || "general"}`
).join("\n")}

위 ${images.length}장에 대해 SEO 최적화 정보를 JSON 배열로 생성해주세요.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 8000,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ ok: false, error: "AI 생성 실패: " + err.slice(0, 200) }, { status: 500 });
    }

    const data = await res.json();
    const raw: string = data.content?.[0]?.text ?? "";
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return NextResponse.json({ ok: false, error: "AI 응답 파싱 실패" }, { status: 422 });

    const generated: any[] = JSON.parse(match[0]);

    // 각 이미지에 의료광고 리스크 체크 + IPTC 메타데이터 조합
    const results = generated.map((g, i) => {
      const img = images[i] ?? images[0];
      const allText = [g.seoFileName, g.title, g.altText, g.caption, g.description].join(" ");
      const risk = checkMedicalRisk(allText);

      // 파일명 sanitize
      const seoFileName = sanitizeFileName(g.seoFileName || `${sanitizeFileName(department)}-${String(i + 1).padStart(2, "0")}.jpg`);

      return {
        originalFileName: img.originalFileName,
        seoFileName,
        title: g.title || "",
        altText: g.altText || "",
        caption: g.caption || "",
        description: g.description || "",
        keywords: g.keywords || [],
        recommendedPageSection: g.recommendedPageSection || "",
        recommendedUse: g.recommendedUse || ["homepage"],
        medicalAdRiskLevel: risk.riskLevel,
        medicalAdRiskReasons: risk.reasons,
        riskyPhrases: risk.riskyPhrases,
        iptcMetadata: {
          title: g.title || "",
          description: g.description || "",
          keywords: g.keywords || [],
          creator: "포토클리닉",
          credit: "포토클리닉 대표 정연호",
          copyright: `© ${new Date().getFullYear()} PHOTOCLINIC`,
          source: "photoclinic.kr",
        },
      };
    });

    return NextResponse.json({ ok: true, results });
  } catch (e) {
    console.error("[seo-delivery/generate]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "생성 실패" },
      { status: 500 }
    );
  }
}
