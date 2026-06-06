import { NextResponse } from "next/server";
import { generateWithFluxRedux, urlToDataUrl } from "@/lib/fal";

export const dynamic     = "force-dynamic";
export const maxDuration = 180;

/* ────────────────────────────────────────────────
   OpenAI gpt-image-1 — 얼굴 보존 베리에이션
   openaiStrength 0-100: 높을수록 얼굴 보존 강도 ↑
──────────────────────────────────────────────── */
async function variateWithOpenAI(
  baseFile:       File | string,
  refFile:        File,
  openaiStrength: number,
  count:          number,
): Promise<string[]> {
  const preserveLevel =
    openaiStrength >= 80 ? "CRITICAL — preserve at 100%"
    : openaiStrength >= 50 ? "IMPORTANT — preserve at 90%"
    : "MODERATE — preserve at 80%";

  const prompt =
    "You are editing a professional Korean medical clinic photograph. " +
    `Face & identity preservation: [${preserveLevel}]. ` +
    "Apply only a very subtle lighting and color-temperature variation. " +
    "ABSOLUTE RULES: " +
    "① Face, facial features, identity, skin tone — DO NOT change. " +
    "② Hair color, length, individual strands — DO NOT change. " +
    "③ Body shape, pose, hand positions — DO NOT change. " +
    "④ Clothing, accessories (lab coat, gloves, necklace, earrings) — DO NOT change. " +
    "⑤ Background composition, depth of field — DO NOT change. " +
    "ONLY allowed: tiny shift in color temperature, brightness ±5%, micro-crop adjustment. " +
    "The result must look like the SAME photo taken seconds later with slightly adjusted camera settings. " +
    "Real DSLR photograph — NOT AI-generated. Preserve pores, hair strands, fabric texture.";

  const editForm = new FormData();
  editForm.append("model",  "gpt-image-1");
  editForm.append("prompt", prompt);
  editForm.append("n",      String(count));
  editForm.append("size",   "1536x1024");

  if (typeof baseFile === "string") {
    const base64   = baseFile.split(",")[1];
    const mimeType = baseFile.split(";")[0].split(":")[1];
    const buffer   = Buffer.from(base64, "base64");
    const blob     = new Blob([buffer], { type: mimeType });
    editForm.append("image[]", new File([blob], "base.jpg", { type: mimeType }));
  } else {
    editForm.append("image[]", baseFile);
  }
  editForm.append("image[]", refFile);

  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method:  "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body:    editForm,
  });

  const rawText = await res.text();
  let data: { data?: { b64_json?: string; url?: string }[]; error?: { message?: string } };
  try { data = JSON.parse(rawText); }
  catch { throw new Error(`OpenAI 응답 오류 (${res.status}): ${rawText.slice(0, 120)}`); }
  if (!res.ok) throw new Error(data.error?.message || "OpenAI 편집 실패");

  return (data.data || []).map(item =>
    item.b64_json ? `data:image/png;base64,${item.b64_json}` : item.url || ""
  );
}

/* ────────────────────────────────────────────────
   메인 라우트
──────────────────────────────────────────────── */
export async function POST(request: Request) {
  try {
    const formData      = await request.formData();
    const file          = formData.get("image")          as File | null;
    const fluxStrength  = Math.min(100, Math.max(0, parseInt(String(formData.get("fluxStrength")   || "40"))));
    const openaiStrength = Math.min(100, Math.max(0, parseInt(String(formData.get("openaiStrength") || "80"))));
    const count         = Math.min(4, Math.max(1, parseInt(String(formData.get("count") || "4"))));

    if (!file) {
      return NextResponse.json({ ok: false, error: "이미지가 없습니다." }, { status: 400 });
    }

    if (fluxStrength === 0 && openaiStrength === 0) {
      return NextResponse.json({ ok: false, error: "Flux 또는 OpenAI 강도를 1% 이상으로 설정해주세요." }, { status: 400 });
    }

    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    const hasFal    = !!process.env.FAL_API_KEY;

    // 두 키 모두 없으면 플레이스홀더
    if (!hasOpenAI && !hasFal) {
      return NextResponse.json({
        ok:     true,
        pipeline: "placeholder",
        images: Array.from({ length: count }, (_, i) => ({
          url: `https://placehold.co/1200x800/EAF4F2/155855.png?text=Variation+${i + 1}`,
          no:  i + 1,
        })),
      });
    }

    /* ── 파이프라인 결정 ── */
    const useFlux   = fluxStrength   > 0 && hasFal;
    const useOpenAI = openaiStrength > 0 && hasOpenAI;

    let finalUrls: string[];
    let pipeline:  string;

    if (useFlux && useOpenAI) {
      // ── 2단계: Flux 변형 → OpenAI 얼굴 복원 ──
      pipeline = "flux+openai";
      console.log(`[variation] Flux(${fluxStrength}%) → OpenAI(${openaiStrength}%)`);

      // redux_strength: 0-100% → 0.05-0.80
      const reduxStrength = 0.05 + (fluxStrength / 100) * 0.75;

      const BASE_STYLE =
        "photorealistic DSLR photograph, Korean medical clinic, " +
        "Canon EOS R5 85mm f/1.4, warm backlight, natural bokeh, warm ivory interior";

      const fluxUrls = await generateWithFluxRedux(file, BASE_STYLE, count, {
        redux_strength:  reduxStrength,
        guidance_scale:  2.0 + (fluxStrength / 100) * 2.0,
        steps:           18  + Math.round((fluxStrength / 100) * 12),
      });

      finalUrls = await Promise.all(
        fluxUrls.map(async fluxUrl => {
          const baseDataUrl = await urlToDataUrl(fluxUrl);
          const results     = await variateWithOpenAI(baseDataUrl, file, openaiStrength, 1);
          return results[0] || fluxUrl;
        })
      );

    } else if (useOpenAI && !useFlux) {
      // ── OpenAI만 (얼굴 최대 보존) ──
      pipeline = "openai-only";
      console.log(`[variation] OpenAI only (${openaiStrength}%)`);
      finalUrls = await variateWithOpenAI(file, file, openaiStrength, count);

    } else {
      // ── Flux만 ──
      pipeline = "flux-only";
      console.log(`[variation] Flux only (${fluxStrength}%)`);
      const reduxStrength = 0.05 + (fluxStrength / 100) * 0.75;
      const BASE_STYLE = "photorealistic DSLR photograph, Korean medical clinic, Canon EOS R5 85mm f/1.4, warm backlight, natural bokeh";
      finalUrls = await generateWithFluxRedux(file, BASE_STYLE, count, {
        redux_strength: reduxStrength,
        guidance_scale: 2.0 + (fluxStrength / 100) * 2.0,
        steps:          18  + Math.round((fluxStrength / 100) * 12),
      });
    }

    return NextResponse.json({
      ok:       true,
      pipeline,
      images:   finalUrls.map((url, i) => ({ url, no: i + 1 })),
    });

  } catch (e) {
    console.error("[variation] error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "생성 실패" },
      { status: 500 }
    );
  }
}
