import { NextResponse } from "next/server";
import { generateWithFluxRedux, urlToDataUrl } from "@/lib/fal";

export const dynamic     = "force-dynamic";
export const maxDuration = 180; // 2단계 파이프라인 → 시간 여유

// 포토클리닉 스타일 기본값
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

/* ── 변화 강도별 Flux 파라미터 ── */
const STRENGTH_PARAMS = [
  { redux_strength: 0.25, guidance_scale: 2.0, steps: 20 }, // A-  최소 변화
  { redux_strength: 0.40, guidance_scale: 2.5, steps: 24 }, // A   약간 변화
  { redux_strength: 0.55, guidance_scale: 3.0, steps: 26 }, // A+  중간 변화
  { redux_strength: 0.70, guidance_scale: 3.5, steps: 28 }, // A++ 많이 변화
];

/* ── OpenAI gpt-image-1: 원본 얼굴 복원 ── */
async function applyOriginalFace(
  fluxUrl:      string,
  originalFile: File,
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) return fluxUrl; // API 키 없으면 Flux 결과 그대로 사용

  const baseDataUrl = await urlToDataUrl(fluxUrl);
  const base64      = baseDataUrl.split(",")[1];
  const mimeType    = baseDataUrl.split(";")[0].split(":")[1];
  const baseBuffer  = Buffer.from(base64, "base64");
  const baseBlob    = new Blob([baseBuffer], { type: mimeType });

  const editForm = new FormData();
  editForm.append("model",  "gpt-image-1");
  editForm.append("prompt",
    "This AI-generated image has the right lighting, composition, and background. " +
    "Now apply the EXACT face, skin texture, hair, and personal appearance from the " +
    "second reference photo (the original person) to this image. " +
    "Preserve ALL other elements: clothing, gloves, background, lighting, pose, crop. " +
    "The result must look like a natural professional Korean medical clinic photo — " +
    "NOT AI-generated. Keep every real-photo detail including minor skin imperfections."
  );
  editForm.append("n",    "1");
  editForm.append("size", "1536x1024");
  editForm.append("image[]", new File([baseBlob], "base.jpg", { type: mimeType }));
  editForm.append("image[]", originalFile);

  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method:  "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body:    editForm,
  });

  const rawText = await res.text();
  let data: { data?: { b64_json?: string; url?: string }[]; error?: { message?: string } };
  try { data = JSON.parse(rawText); }
  catch { return fluxUrl; } // 파싱 실패 시 Flux 결과 사용

  if (!res.ok) {
    console.error("[variation] OpenAI face step error:", data.error?.message);
    return fluxUrl; // OpenAI 실패해도 Flux 결과 반환 (에러 내지 않음)
  }

  const item = data.data?.[0];
  if (!item) return fluxUrl;
  return item.b64_json
    ? `data:image/png;base64,${item.b64_json}`
    : item.url || fluxUrl;
}

/* ── 메인 라우트 ── */
export async function POST(request: Request) {
  try {
    const formData  = await request.formData();
    const file      = formData.get("image")     as File | null;
    const direction = String(formData.get("direction") || "natural");
    const strength  = Math.min(parseInt(String(formData.get("strength") || "1")), 3);
    const count     = Math.min(parseInt(String(formData.get("count")    || "4")), 4);

    if (!file) {
      return NextResponse.json({ ok: false, error: "이미지가 없습니다." }, { status: 400 });
    }

    // 두 API 키 모두 없으면 플레이스홀더
    if (!process.env.FAL_API_KEY && !process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        ok:     true,
        images: Array.from({ length: count }, (_, i) => ({
          url: `https://placehold.co/1200x800/EAF4F2/155855.png?text=Variation+${i + 1}`,
          no:  i + 1,
        })),
      });
    }

    const dirPrompt    = DIRECTION_PROMPTS[direction] ?? DIRECTION_PROMPTS.natural;
    const fullPrompt   = `${BASE_STYLE}, ${dirPrompt}`;
    const fluxParams   = STRENGTH_PARAMS[strength] ?? STRENGTH_PARAMS[1];
    const hasBothAPIs  = !!process.env.FAL_API_KEY && !!process.env.OPENAI_API_KEY;

    console.log(`[variation] Step 1: Flux Redux (strength=${fluxParams.redux_strength})`);
    const fluxUrls = await generateWithFluxRedux(file, fullPrompt, count, fluxParams);

    let finalUrls: string[];

    if (hasBothAPIs) {
      // ── 2단계 파이프라인: Flux → OpenAI 얼굴 복원 ──
      console.log("[variation] Step 2: OpenAI gpt-image-1 face restoration");
      finalUrls = await Promise.all(
        fluxUrls.map((url) => applyOriginalFace(url, file))
      );
    } else {
      // ── fal.ai만 있을 때 ──
      finalUrls = fluxUrls;
    }

    return NextResponse.json({
      ok:     true,
      pipeline: hasBothAPIs ? "flux+openai" : "flux-only",
      images: finalUrls.map((url, i) => ({ url, no: i + 1 })),
    });

  } catch (e) {
    console.error("[variation] error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "생성 실패" },
      { status: 500 }
    );
  }
}
