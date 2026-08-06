import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { DOCTOR_POSE_OPTIONS } from "@/lib/youtube-editing/constants";
import type { DoctorPoseKey } from "@/lib/youtube-editing/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

const BUCKET = "youtube-editing-assets";

const STYLE_SUFFIX =
  "black and white line art illustration, clean thin ink outline, minimalist medical storyboard sketch style, " +
  "no shading, no color, no background, plain white background, friendly professional doctor character wearing " +
  "glasses and a white lab coat with a lavalier microphone clip on the lapel, conti illustration style, high detail linework";

const POSE_PROMPT: Record<DoctorPoseKey, string> = {
  front_basic: "standing straight, facing forward, arms relaxed at sides",
  front_explain_both_hands: "facing forward, both hands raised open at chest height as if explaining something to camera",
  front_one_finger: "facing forward, right hand raised with index finger pointing upward, confident explaining gesture",
  front_x: "facing forward, both arms crossed in front of chest forming a large X shape",
  left_45: "body and head turned slightly to the left at a 45 degree angle, one hand gesturing while speaking",
  right_45: "body and head turned slightly to the right at a 45 degree angle, one hand gesturing while speaking",
};

async function generatePoseImage(poseKey: DoctorPoseKey): Promise<Buffer> {
  const prompt = `${POSE_PROMPT[poseKey]}. ${STYLE_SUFFIX}`;
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      n: 1,
      size: "1024x1024",
      quality: "high",
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error(`포즈 ${poseKey} 이미지 생성 결과가 비어있습니다.`);
  return Buffer.from(b64, "base64");
}

// 6가지 원장 포즈 선화 이미지를 OpenAI gpt-image-1로 한 번 생성해 공개 버킷의 고정 경로에 업로드한다.
// 프론트엔드(DoctorPoseIcon)는 이 고정 경로를 직접 참조하므로, 재생성 시 같은 경로에 덮어쓰면 된다.
export async function POST() {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: false, error: "OPENAI_API_KEY가 설정되어 있지 않습니다." }, { status: 500 });
  }
  const db = getSupabaseAdmin();
  const results: { poseKey: DoctorPoseKey; url?: string; error?: string }[] = [];

  for (const { key } of DOCTOR_POSE_OPTIONS) {
    try {
      const buffer = await generatePoseImage(key);
      const path = `doctor-poses/${key}.png`;
      const { error: uploadError } = await db.storage.from(BUCKET).upload(path, buffer, {
        contentType: "image/png",
        upsert: true,
      });
      if (uploadError) throw new Error(uploadError.message);
      const { data } = db.storage.from(BUCKET).getPublicUrl(path);
      results.push({ poseKey: key, url: data.publicUrl });
    } catch (error) {
      results.push({ poseKey: key, error: error instanceof Error ? error.message : "생성 실패" });
    }
  }

  const failed = results.filter((r) => r.error);
  return NextResponse.json({ ok: failed.length === 0, results, error: failed.length ? `${failed.length}개 포즈 생성 실패` : undefined });
}
