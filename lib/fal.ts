/**
 * fal.ai API 유틸리티
 * Replicate lib/replicate.ts를 대체합니다.
 *
 * 사용 모델:
 *  - 이미지 배리에이션: fal-ai/flux/redux (Flux Redux)
 *  - 텍스트→이미지:    fal-ai/flux/dev   (Flux Dev)
 */

const FAL_KEY  = process.env.FAL_API_KEY ?? "";
const FAL_BASE = "https://fal.run";

/* ─────────────────────────────────────────
   이미지 업로드 (fal.ai Storage)
───────────────────────────────────────── */
export async function uploadToFal(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer      = Buffer.from(arrayBuffer);

  const res = await fetch(`${FAL_BASE}/files/upload`, {
    method:  "POST",
    headers: {
      Authorization:  `Key ${FAL_KEY}`,
      "Content-Type": file.type || "image/jpeg",
    },
    body: buffer,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`fal.ai 업로드 실패 (${res.status}): ${text.slice(0, 120)}`);
  }

  const data = (await res.json()) as { url: string };
  return data.url;
}

/* ─────────────────────────────────────────
   Flux Redux — 이미지 배리에이션
   원본 사진을 기반으로 여러 버전 생성
───────────────────────────────────────── */
export async function generateWithFluxRedux(
  image:   File,
  prompt:  string,
  count  = 4,
  options: { redux_strength?: number; guidance_scale?: number; steps?: number } = {},
): Promise<string[]> {
  const imageUrl = await uploadToFal(image);

  const res = await fetch(`${FAL_BASE}/fal-ai/flux/redux`, {
    method:  "POST",
    headers: {
      Authorization:  `Key ${FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      redux_image_url:       imageUrl,
      num_images:            count,
      enable_safety_checker: false,
      redux_strength:        options.redux_strength  ?? 0.75,
      guidance_scale:        options.guidance_scale  ?? 3.5,
      num_inference_steps:   options.steps           ?? 28,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Flux Redux 실패 (${res.status}): ${text.slice(0, 120)}`);
  }

  const data = (await res.json()) as { images?: { url: string }[] };
  return (data.images ?? []).map((img) => img.url);
}

/* ─────────────────────────────────────────
   Flux Dev — 텍스트→이미지 생성
───────────────────────────────────────── */
export async function generateWithFluxDev(
  prompt: string,
  count = 4,
): Promise<string[]> {
  const res = await fetch(`${FAL_BASE}/fal-ai/flux/dev`, {
    method:  "POST",
    headers: {
      Authorization:  `Key ${FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      num_images:             count,
      image_size:             "landscape_4_3",
      enable_safety_checker:  false,
      guidance_scale:         3.5,
      num_inference_steps:    28,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Flux Dev 실패 (${res.status}): ${text.slice(0, 120)}`);
  }

  const data = (await res.json()) as { images?: { url: string }[] };
  return (data.images ?? []).map((img) => img.url);
}

/* ─────────────────────────────────────────
   URL → Base64 Data URL 변환 유틸리티
───────────────────────────────────────── */
export async function urlToDataUrl(url: string): Promise<string> {
  const res      = await fetch(url);
  const buffer   = await res.arrayBuffer();
  const base64   = Buffer.from(buffer).toString("base64");
  const mimeType = res.headers.get("content-type") || "image/jpeg";
  return `data:${mimeType};base64,${base64}`;
}
