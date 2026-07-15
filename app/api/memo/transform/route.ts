import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

const BUCKET = "consultation-assets";

function outputText(json: any): string {
  if (typeof json.output_text === "string") return json.output_text;
  for (const item of json.output ?? []) for (const part of item.content ?? []) if (typeof part.text === "string") return part.text;
  return "";
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!match) throw new Error("올바른 캔버스 이미지가 아닙니다.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 15 * 1024 * 1024) throw new Error("캔버스 이미지는 15MB까지 지원합니다.");
  return { mime: match[1], bytes };
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "OPENAI_API_KEY 미설정" }, { status: 500 });
  try {
    const body = await req.json();
    const mode = body.mode === "image" ? "image" : "text";
    const canvas = String(body.canvas_data_url || "");
    if (!canvas) return NextResponse.json({ ok: false, error: "분석할 필기나 그림이 없습니다." }, { status: 400 });
    const { mime, bytes } = parseDataUrl(canvas);
    const context = [String(body.raw_memo || ""), String(body.transcript || "")].filter(Boolean).join("\n\n").slice(0, 50_000);

    if (mode === "text") {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: process.env.OPENAI_MEMO_VISION_MODEL || "gpt-4.1-mini",
          instructions: "한국어 상담 노트의 손글씨, 도형, 화살표와 콘티를 분석해 읽을 수 있는 텍스트로 정리하세요. 반드시 요약, 결정 사항, 요청 사항, 할 일, 촬영 아이디어 순서로 쓰고 보이지 않는 내용은 추측하지 마세요.",
          input: [{ role: "user", content: [
            { type: "input_text", text: `기존 메모 참고:\n${context || "없음"}` },
            { type: "input_image", image_url: canvas },
          ] }],
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message || "필기 분석 실패");
      return NextResponse.json({ ok: true, text: outputText(json) });
    }

    const imageForm = new FormData();
    imageForm.append("model", process.env.OPENAI_IMAGE_MODEL || "gpt-image-2");
    imageForm.append("image", new File([bytes], mime === "image/jpeg" ? "note.jpg" : "note.png", { type: mime }));
    imageForm.append("prompt", "이 손그림 상담 노트의 원래 배치, 칸 구조, 화살표와 의미를 유지하면서 깔끔한 한국어 디지털 노트 또는 촬영 콘티로 정돈하세요. 흰 배경, 짙은 청록 선, 주황 포인트, 읽기 쉬운 타이포그래피를 사용하고 새로운 사실은 추가하지 마세요.");
    imageForm.append("quality", "low");
    imageForm.append("size", "1536x1024");
    imageForm.append("output_format", "png");
    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: imageForm,
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error?.message || "이미지 정돈 실패");
    const base64 = json.data?.[0]?.b64_json;
    if (!base64) throw new Error("생성된 이미지가 없습니다.");

    const memoId = String(body.memo_id || "");
    let path: string | null = null;
    let url: string | null = null;
    if (memoId) {
      const db = getSupabaseAdmin();
      path = `${memoId}/ai-image-${Date.now()}.png`;
      const { data: current } = await db.from("consultation_memos").select("ai_image_path").eq("id", memoId).maybeSingle();
      const { error: uploadError } = await db.storage.from(BUCKET).upload(path, Buffer.from(base64, "base64"), { contentType: "image/png", upsert: false });
      if (uploadError) throw uploadError;
      const { error: updateError } = await db.from("consultation_memos").update({ ai_image_path: path }).eq("id", memoId);
      if (updateError) { await db.storage.from(BUCKET).remove([path]); throw updateError; }
      if (current?.ai_image_path) await db.storage.from(BUCKET).remove([current.ai_image_path]);
      const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
      url = signed?.signedUrl ?? null;
    }
    return NextResponse.json({ ok: true, image: `data:image/png;base64,${base64}`, path, url });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "AI 변환 실패" }, { status: 500 });
  }
}
