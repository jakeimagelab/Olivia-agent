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
  return `Medical clinic photography scene illustration, watercolor and sketch style, soft warm tones:
Scene: ${row.category} at ${row.location}
Concept: ${row.keyword}
Description: ${row.description}
People: ${row.personnel}
Style: Korean medical clinic, professional, clean, warm beige and white tones, anime-inspired illustration, storyboard concept art, no text, no labels`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY 미설정" }, { status: 500 });
  }

  const { rows } = await req.json() as { rows: ContiRow[] };
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "rows 필요" }, { status: 400 });
  }

  // 최대 6개만 생성 (비용 절감)
  const targets = rows.slice(0, 10);

  const results = await Promise.allSettled(
    targets.map(async (row, i) => {
      const prompt = buildPrompt(row);
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "dall-e-2",
          prompt,
          n: 1,
          size: "512x512",
          response_format: "url",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "이미지 생성 실패");
      return { index: i, url: data.data[0].url };
    })
  );

  const images: Record<number, string> = {};
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      images[r.value.index] = r.value.url;
    }
  });

  return NextResponse.json({ ok: true, images });
}
