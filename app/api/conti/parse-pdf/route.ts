import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const SUPPORTED_TYPES = ["application/pdf", ...SUPPORTED_IMAGE_TYPES];

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY 미설정" }, { status: 500 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ ok: false, error: "파일이 없습니다." }, { status: 400 });
    }

    const mimeType = file.type || "application/octet-stream";
    if (!SUPPORTED_TYPES.includes(mimeType)) {
      return NextResponse.json(
        { ok: false, error: `지원하지 않는 파일 형식입니다. (PDF, JPG, PNG, WEBP 가능)` },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const isPdf = mimeType === "application/pdf";

    const systemPrompt = `당신은 병원 사진 촬영 콘티 문서를 분석하는 전문가입니다.
문서(PDF 또는 이미지)에서 촬영 콘티 정보를 추출하여 아래 JSON 구조로 반환하세요.

반드시 아래 JSON만 반환하고, 다른 텍스트 없이 순수 JSON만 출력하세요:
{
  "conti": [
    {
      "category": "카테고리",
      "duration": "소요시간",
      "location": "장소",
      "cameraAngle": "카메라 구도",
      "keyword": "키워드",
      "description": "설명",
      "personnel": "인원",
      "notes": "비고"
    }
  ],
  "checklist": [
    { "number": 1, "category": "카테고리", "item": "항목", "notes": "" }
  ],
  "schedule": [
    { "time": "시간", "duration": "소요시간", "activity": "활동", "type": "유형", "requirements": "필요사항", "notes": "" }
  ]
}

콘티 표/체크리스트/스케줄이 있으면 그대로 추출합니다.
없는 필드는 빈 문자열로, 없는 섹션은 빈 배열[]로 반환합니다.`;

    const contentBlock = isPdf
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64 },
        }
      : {
          type: "image",
          source: { type: "base64", media_type: mimeType, data: base64 },
        };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    };
    if (isPdf) headers["anthropic-beta"] = "pdfs-2024-09-25";

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              contentBlock,
              {
                type: "text",
                text: "이 문서에서 촬영 콘티 정보를 추출해서 JSON으로 반환해주세요.",
              },
            ],
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      console.error("[parse-pdf] Anthropic error:", err);
      return NextResponse.json({ ok: false, error: "AI 분석 실패: " + err.slice(0, 200) }, { status: 500 });
    }

    const data = await anthropicRes.json();
    const raw: string = data.content?.[0]?.text ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ ok: false, error: "파일에서 콘티를 인식할 수 없습니다." }, { status: 422 });
    }

    const result = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[parse-pdf]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "파일 파싱 실패" },
      { status: 500 }
    );
  }
}
