import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const SIZE_MAP: Record<string, string> = {
  "인스타그램 피드": "1024x1024",
  "릴스 썸네일": "1024x1536",
  "스토리": "1024x1536",
  "홈페이지 배너": "1536x1024",
  "블로그 썸네일": "1536x1024",
  "네이버 플레이스": "1024x1024",
  "제안서": "1536x1024",
  "콘티": "1536x1024",
};

async function buildDirectorPrompt(params: {
  mode: string;
  sceneType: string;
  department: string;
  peopleType: string;
  ageGroup: string;
  mood: string;
  lighting: string;
  composition: string;
  usage: string;
  extraRequest: string;
}): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const systemPrompt = `You are a professional Korean hospital photography director working for Photoclinic (포토클리닉).
Your job is to create detailed image generation prompts that produce HIGHLY REALISTIC hospital brand photography - NOT AI illustrations.
The images must look like they were taken by a professional DSLR camera during actual hospital brand shoots.
Always write prompts in English for best image generation results.
Return ONLY the prompt text, nothing else.`;

  const userMsg = `Create a photorealistic hospital photography prompt based on these inputs:
Scene type: ${params.sceneType}
Department: ${params.department}
People: ${params.peopleType}
Age group: ${params.ageGroup}
Mood: ${params.mood}
Lighting: ${params.lighting}
Composition: ${params.composition}
Usage: ${params.usage}
Extra request: ${params.extraRequest || "none"}
Mode: ${params.mode} (real=photorealistic, variation=slight variation, conti=storyboard style)

Requirements:
- Must look like actual DSLR hospital brand photography (like Photoclinic shoots)
- Natural expressions, NO posed advertising smiles
- White/ivory/warm-toned hospital spaces
- Soft window natural light or studio lighting
- Natural hands and body language
- Doctor/nurse in foreground slightly blurred when relevant
- Warm, trustworthy, clean medical environment feel
- NOT illustration, NOT 3D render, NOT CGI, NOT stock photo look
- NOT scary or uncomfortable medical procedures
- Children must be with guardians in safe, positive contexts

End the prompt with these technical tags:
photorealistic, DSLR photography, hospital brand shoot, natural lighting, Photoclinic style, 85mm lens, f/2.8 aperture, soft bokeh background, editorial medical photography, NOT AI-generated, NOT illustration, NOT CGI`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 600,
    messages: [{ role: "user", content: userMsg }],
    system: systemPrompt,
  });

  return ((response.content[0] as { type: string; text?: string }).text ?? "").trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      mode,
      sceneType,
      department,
      peopleType,
      ageGroup,
      mood,
      lighting,
      composition,
      usage,
      extraRequest,
      refinementRequest,
      selectedImageUrl,
      step,
      customPrompt,
    } = body;

    // 1. 프롬프트 생성
    let finalPrompt: string = customPrompt || "";
    if (!finalPrompt) {
      finalPrompt = await buildDirectorPrompt({
        mode,
        sceneType,
        department,
        peopleType,
        ageGroup,
        mood,
        lighting,
        composition,
        usage,
        extraRequest,
      });
    }
    if (refinementRequest) {
      finalPrompt += `. Refinement: ${refinementRequest}`;
    }

    // conti 모드는 illustrative 느낌 suffix 추가
    if (mode === "conti") {
      finalPrompt +=
        ". Storyboard illustration style, clean lines, soft colors, scene description board layout, Korean medical clinic storyboard frame.";
    }

    // 2. 사이즈 결정
    const sizeStr = SIZE_MAP[usage] || "1024x1024";
    const openAISize = sizeStr as "1024x1024" | "1536x1024" | "1024x1536";

    // 3. 이미지 생성 (4장 or 정교화 2장 parallel)
    const count = step === "refine" ? 2 : 4;

    const generateOne = async (): Promise<string> => {
      // variation 모드이고 selectedImageUrl이 있으면 edits API 사용
      if ((mode === "variation" || step === "refine") && selectedImageUrl) {
        // base64 data URL을 File로 변환
        const base64 = selectedImageUrl.split(",")[1];
        const mimeType = selectedImageUrl.split(";")[0].split(":")[1] || "image/png";
        const buffer = Buffer.from(base64, "base64");
        const blob = new Blob([buffer], { type: mimeType });

        const editForm = new FormData();
        editForm.append("model", "gpt-image-1");
        editForm.append("prompt", finalPrompt);
        editForm.append("n", "1");
        editForm.append("size", openAISize);
        editForm.append("image[]", new File([blob], "source.png", { type: mimeType }));

        const res = await fetch("https://api.openai.com/v1/images/edits", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY!}` },
          body: editForm,
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        const b64 = data.data?.[0]?.b64_json;
        if (!b64) throw new Error("No image returned from edits API");
        return `data:image/png;base64,${b64}`;
      }

      // 기본: gpt-image-1 generations
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY!}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-image-1",
          prompt: finalPrompt,
          n: 1,
          size: openAISize,
          quality: "high",
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      const b64 = data.data?.[0]?.b64_json;
      if (!b64) throw new Error("No image returned");
      return `data:image/png;base64,${b64}`;
    };

    const images = await Promise.all(Array.from({ length: count }, generateOne));

    return NextResponse.json({ ok: true, prompt: finalPrompt, images });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "이미지 생성 실패";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// PATCH — 이미지 상태 업데이트 (선택/검수/저장)
export async function PATCH(req: NextRequest) {
  try {
    const { id, status, checklist, is_selected } = await req.json();
    if (!id) return NextResponse.json({ ok: false, error: "id 필수" }, { status: 400 });
    const db = getSupabaseAdmin();
    await db.from("generated_images").update({ status, checklist, is_selected }).eq("id", id);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "업데이트 실패";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// GET — 저장된 생성 이미지 목록
export async function GET(req: NextRequest) {
  const db = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("client_id");
  let query = db
    .from("generated_images")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);
  if (clientId) query = query.eq("client_id", clientId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, images: data ?? [] });
}
