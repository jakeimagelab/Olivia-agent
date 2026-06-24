import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface ContiRow {
  category: string;
  location: string;
  keyword: string;
  description: string;
  personnel: string;
}

function buildPrompt(row: ContiRow): string {
  return `Korean medical clinic storyboard illustration. Watercolor sketch style, soft warm beige tones, clean professional setting.
Scene: ${row.category} at ${row.location}.
Concept: ${row.keyword}.
People: ${row.personnel}.
Action: ${row.description?.slice(0, 150)}.
Style: anime-inspired medical illustration, no text, no labels, warm lighting.`;
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
          model: "gpt-image-1",
          prompt: prompt.slice(0, 1500),
          n: 1,
          size: "1024x1024",
          quality: "low",          // low = 빠르고 저렴
          output_format: "jpeg",   // jpeg = 용량 작음
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // gpt-image-1 실패 시 dall-e-2로 폴백
        const fallback = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "dall-e-2",
            prompt: prompt.slice(0, 1000),
            n: 1,
            size: "512x512",
            response_format: "url",
          }),
        });
        const fd = await fallback.json();
        if (fd.data?.[0]?.url) {
          images[String(i)] = fd.data[0].url;
        } else {
          errors.push(`씬${i+1}: ${data.error?.message || "실패"}`);
        }
        continue;
      }

      // gpt-image-1은 base64 반환
      if (data.data?.[0]?.b64_json) {
        images[String(i)] = `data:image/jpeg;base64,${data.data[0].b64_json}`;
      } else if (data.data?.[0]?.url) {
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
