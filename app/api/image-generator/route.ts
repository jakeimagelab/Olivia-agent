import { NextResponse } from "next/server";
import { generateWithFluxDev, generateWithFluxRedux, urlToDataUrl } from "@/lib/replicate";

type ImageGeneratorPayload = {
  prompt: string;
  category: string;
};

type OpenAIImageItem = {
  b64_json?: string;
  url?: string;
};

type OpenAIImageResponse = {
  data?: OpenAIImageItem[];
  error?: { message?: string };
};

// ─────────────────────────────────────────
// OpenAI edits — 얼굴 참조 적용
// images[0] = 베이스 이미지 (Flux Redux 결과 또는 없을 때 생략)
// images[1] = 얼굴 레퍼런스
// ─────────────────────────────────────────
async function applyFaceWithOpenAI(
  prompt: string,
  faceImage: File,
  baseImageDataUrl?: string  // Flux Redux 결과를 베이스로 사용
): Promise<string[]> {
  const editForm = new FormData();
  editForm.append("model", "gpt-image-1");
  editForm.append("prompt", prompt);
  editForm.append("n", "4");
  editForm.append("size", "1024x1024");

  // 베이스 이미지가 있으면 첫 번째로, 얼굴 레퍼런스 두 번째로
  // OpenAI edits API는 image[] 배열 문법 필요
  if (baseImageDataUrl) {
    const base64 = baseImageDataUrl.split(",")[1];
    const mimeType = baseImageDataUrl.split(";")[0].split(":")[1];
    const baseBuffer = Buffer.from(base64, "base64");
    const baseBlob = new Blob([baseBuffer], { type: mimeType });
    editForm.append("image[]", new File([baseBlob], "base.jpg", { type: mimeType }));
    editForm.append("image[]", faceImage);
  } else {
    editForm.append("image[]", faceImage);
  }

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: editForm
  });

  const data = (await response.json()) as OpenAIImageResponse;
  if (!response.ok) throw new Error(data.error?.message || "OpenAI 이미지 편집에 실패했습니다.");

  return (data.data || []).map((item) =>
    item.b64_json ? `data:image/png;base64,${item.b64_json}` : item.url || ""
  );
}

// ─────────────────────────────────────────
// 메인 라우트
// ─────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    const isMultipart = contentType.includes("multipart/form-data");
    const body = isMultipart ? null : ((await request.json()) as ImageGeneratorPayload);
    const formData = isMultipart ? await request.formData() : null;

    const prompt = isMultipart ? String(formData?.get("prompt") || "") : body?.prompt || "";
    const category = isMultipart ? String(formData?.get("category") || "") : body?.category || "";
    const faceImage = formData?.get("referenceImage");
    const styleImage = formData?.get("styleReferenceImage");

    if (!prompt.trim()) {
      return NextResponse.json({ error: "프롬프트가 비어 있습니다." }, { status: 400 });
    }

    // 토큰 없을 때 플레이스홀더
    if (!process.env.REPLICATE_API_TOKEN && !process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        images: Array.from({ length: 4 }, (_, i) => ({
          imageUrl: `https://placehold.co/1024x1024/faf7f2/155855.png?text=PHOTOCLINIC+AI+${i + 1}`,
          variationNo: i + 1,
          category: category || "포토클리닉 AI 이미지"
        }))
      });
    }

    let imageUrls: string[];
    const hasFace = faceImage instanceof File;
    const hasStyle = styleImage instanceof File;

    if (hasStyle && hasFace) {
      // ── B안: 2단계 파이프라인 ──────────────────────────────
      // 1단계: Flux Redux로 스타일 레퍼런스 기반 이미지 4장 생성
      console.log("[Pipeline] Step 1: Flux Redux — style reference");
      const fluxResults = await generateWithFluxRedux(styleImage, prompt, 4);

      // 2단계: 각 결과에 얼굴 적용 (OpenAI edits 병렬 4회)
      console.log("[Pipeline] Step 2: OpenAI edits — face reference");
      const facePrompt = `Apply the doctor's face and appearance from the reference photo to this scene. Maintain the exact same composition, lighting, background, and color tone. The result should look like a natural professional hospital photo.`;

      imageUrls = await Promise.all(
        fluxResults.map(async (fluxUrl) => {
          const baseDataUrl = await urlToDataUrl(fluxUrl);
          const edited = await applyFaceWithOpenAI(facePrompt, faceImage, baseDataUrl);
          return edited[0]; // 각 베이스에서 1장씩
        })
      );

    } else if (hasStyle) {
      // ── 스타일 레퍼런스만: Flux Redux ──────────────────────
      console.log("[Pipeline] Flux Redux only — style reference");
      imageUrls = await generateWithFluxRedux(styleImage, prompt, 4);

    } else if (hasFace) {
      // ── 얼굴 레퍼런스만: OpenAI edits ─────────────────────
      console.log("[Pipeline] OpenAI edits only — face reference");
      imageUrls = await applyFaceWithOpenAI(prompt, faceImage);

    } else {
      // ── 레퍼런스 없음: Flux Dev 텍스트 생성 ────────────────
      console.log("[Pipeline] Flux Dev — text only");
      imageUrls = await generateWithFluxDev(prompt, 4);
    }

    const images = imageUrls.map((imageUrl, index) => ({
      imageUrl,
      variationNo: index + 1,
      category: category || "포토클리닉 AI 이미지"
    }));

    return NextResponse.json({ images });

  } catch (error) {
    console.error("[image-generator] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "이미지 생성에 실패했습니다." },
      { status: 500 }
    );
  }
}
