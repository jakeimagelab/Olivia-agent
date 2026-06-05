import { NextResponse } from "next/server";
import { generateWithFluxRedux } from "@/lib/replicate";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// 포토클리닉 스타일 기본값 — 역광·림라이트·화사한 병원 분위기
const BASE_STYLE =
  "photorealistic DSLR photograph, Korean medical clinic, " +
  "Canon EOS R5 85mm f/1.4, warm backlight with rim lighting on subjects, " +
  "natural bokeh, warm ivory beige interior, bright airy mood, " +
  "high-end Korean clinic editorial photography";

const DIRECTION_PROMPTS: Record<string, string> = {
  natural:  "maintain original mood and lighting, subtle variation",
  warm:     "warmer color temperature, golden hour glow, richer skin tones",
  bright:   "brighter exposure, lifted shadows, airy high-key feel",
  cool:     "slightly cooler cleaner light, crisp morning tones",
  dramatic: "stronger rim light contrast, deeper shadows, vivid",
  close:    "tighter framing, closer crop, intimate perspective",
};

export async function POST(request: Request) {
  try {
    const formData  = await request.formData();
    const file      = formData.get("image") as File | null;
    const direction = String(formData.get("direction") || "natural");
    const count     = Math.min(parseInt(String(formData.get("count") || "4")), 4);

    if (!file) {
      return NextResponse.json({ ok: false, error: "이미지가 없습니다." }, { status: 400 });
    }

    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json({
        ok: true,
        images: Array.from({ length: count }, (_, i) => ({
          url: `https://placehold.co/1200x800/EAF4F2/155855.png?text=Variation+${i + 1}`,
          no:  i + 1,
        })),
      });
    }

    const dirPrompt   = DIRECTION_PROMPTS[direction] || DIRECTION_PROMPTS.natural;
    const fullPrompt  = `${BASE_STYLE}, ${dirPrompt}`;

    const urls = await generateWithFluxRedux(file, fullPrompt, count);

    return NextResponse.json({
      ok: true,
      images: urls.map((url, i) => ({ url, no: i + 1 })),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "생성 실패" },
      { status: 500 }
    );
  }
}
