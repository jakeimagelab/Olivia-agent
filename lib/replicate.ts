const FLUX_DEV_MODEL = "black-forest-labs/flux-dev";
const FLUX_REDUX_MODEL = "black-forest-labs/flux-redux-dev";

type ReplicatePrediction = {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string[];
  error?: string;
  detail?: string;
};

// ─────────────────────────────────────────
// 공통: 예측 결과 폴링
// ─────────────────────────────────────────
async function pollPrediction(id: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const response = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` }
    });
    const data = (await response.json()) as ReplicatePrediction;
    if (data.status === "succeeded" && data.output?.[0]) return data.output[0];
    if (data.status === "failed" || data.status === "canceled") {
      throw new Error(data.error ?? "Flux 이미지 생성에 실패했습니다.");
    }
  }
  throw new Error("Flux 이미지 생성 시간 초과.");
}

async function runPrediction(model: string, input: Record<string, unknown>): Promise<string> {
  const response = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json",
      Prefer: "wait"
    },
    body: JSON.stringify({ input })
  });

  const data = (await response.json()) as ReplicatePrediction;
  if (!response.ok) throw new Error(data.detail ?? "Replicate 요청에 실패했습니다.");
  if (data.status === "succeeded" && data.output?.[0]) return data.output[0];
  return await pollPrediction(data.id);
}

// ─────────────────────────────────────────
// File → base64 data URL 변환
// ─────────────────────────────────────────
export async function fileToDataUrl(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${buffer.toString("base64")}`;
}

// URL → base64 data URL 변환 (2단계에서 Flux 결과물을 OpenAI에 넘길 때 사용)
export async function urlToDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "image/jpeg";
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

// ─────────────────────────────────────────
// Flux Dev — 텍스트 프롬프트만으로 생성
// ─────────────────────────────────────────
export async function generateWithFluxDev(prompt: string, count = 4): Promise<string[]> {
  return await Promise.all(
    Array.from({ length: count }, () =>
      runPrediction(FLUX_DEV_MODEL, {
        prompt,
        num_outputs: 1,
        aspect_ratio: "1:1",
        output_format: "jpg",
        output_quality: 92,
        num_inference_steps: 40,
        guidance: 3.5
      })
    )
  );
}

// ─────────────────────────────────────────
// Flux Redux — 스타일 레퍼런스 이미지로 변형 생성
// ─────────────────────────────────────────
export async function generateWithFluxRedux(
  styleImageFile: File,
  prompt: string,
  count = 4
): Promise<string[]> {
  const styleDataUrl = await fileToDataUrl(styleImageFile);

  return await Promise.all(
    Array.from({ length: count }, () =>
      runPrediction(FLUX_REDUX_MODEL, {
        redux_image: styleDataUrl,
        prompt,
        num_outputs: 1,
        output_format: "jpg",
        output_quality: 92,
        num_inference_steps: 28,
        guidance: 3
      })
    )
  );
}
