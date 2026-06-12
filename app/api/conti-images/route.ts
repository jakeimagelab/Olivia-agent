import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ContiRow {
  category: string;
  location: string;
  keyword: string;
  description: string;
  personnel: string;
}

function buildPrompt(row: ContiRow): string {
  return `Korean medical clinic storyboard illustration. Scene: ${row.category} in ${row.location}. Concept: ${row.keyword}. People: ${row.personnel}. Style: clean watercolor sketch, warm beige tones, professional medical setting, no text`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY 미설정" }, { status: 500 });
  }

  const body = await req.json();
  const rows: ContiRow[] = body.rows || [];

  if (rows.length === 0) {
    return NextResponse.json({ error: "rows 필요" }, { status: 400 });
  }

  // 최대 4개만 순차 생성 (동시 요청 제한 + 타임아웃 방지)
  const targets = rows.slice(0, 4);
  const images: Record<string, string> = {};
  const errors: string[] = [];

  for (let i = 0; i < targets.length; i++) {
    try {
      const prompt = buildPrompt(targets[i]);
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "dall-e-2",
          prompt: prompt.slice(0, 1000), // DALL-E 2 프롬프트 1000자 제한
          n: 1,
          size: "256x256", // 가장 작고 빠른 사이즈
          response_format: "url",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        errors.push(`씬${i+1}: ${data.error?.message || "실패"}`);
        continue;
      }

      if (data.data?.[0]?.url) {
        images[String(i)] = data.data[0].url;
      }
    } catch (e: any) {
      errors.push(`씬${i+1}: ${e.message}`);
    }
  }

  return NextResponse.json({
    ok: true,
    images,
    errors: errors.length > 0 ? errors : undefined,
    generated: Object.keys(images).length,
    total: targets.length,
  });
}
