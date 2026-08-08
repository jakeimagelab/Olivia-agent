import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { SCENE_TYPES } from "@/lib/conti-library/config";
import { buildDocumentEmbeddingText, buildSceneEmbeddingText, embedTexts } from "@/lib/conti-library/embeddings";
import { rowToDocument } from "@/lib/conti-library/serialize";
import type { ExtractedCaseDocument, ExtractedCaseScene } from "@/lib/conti-library/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

const BUCKET = "conti-case-library";

// app/api/conti/parse-pdf/route.ts와 같은 방식(Claude PDF document 블록, OCR/pdf-parse 없이
// Claude 네이티브 PDF 이해 사용)을 확장해 훨씬 상세한 장면 단위 구조까지 뽑아낸다.
const SYSTEM_PROMPT = `당신은 병원 사진 촬영 콘티 문서를 분석해 장면 단위로 구조화하는 전문가입니다.
문서(PDF)에서 콘티 정보를 추출하여 아래 JSON 구조로만 반환하세요. 다른 텍스트 없이 순수 JSON만 출력합니다.

{
  "document": {
    "clinicName": "병원명 (알 수 없으면 빈 문자열)",
    "departments": ["진료과 (여러 개면 배열, 예: 피부과, 웰니스)"],
    "shootingType": "촬영 목적 (예: 홈페이지 브랜드 촬영)",
    "doctorCount": 1,
    "keywords": ["핵심 키워드 3~8개"]
  },
  "scenes": [
    {
      "sceneOrder": 1,
      "sceneName": "장면 이름 (예: 울쎄라 상담)",
      "sceneType": "아래 scene_type 목록 중 정확히 하나",
      "department": "이 장면이 속한 진료과",
      "subjects": ["등장 인물, 예: 원장, 환자"],
      "location": "촬영 장소",
      "action": "행동 묘사 (예: 원장이 모니터를 보며 환자에게 설명)",
      "cameraAngle": "카메라 구도 (예: 좌측 45도, 정면)",
      "shotSize": "샷 사이즈 (예: medium, close-up, wide)",
      "pose": "포즈 설명",
      "props": ["소품"],
      "equipment": ["장비"],
      "direction": "연출 지시사항",
      "notes": "비고"
    }
  ]
}

scene_type은 반드시 다음 중 하나만 사용하세요: ${SCENE_TYPES.join(", ")}
문서에 없는 필드는 빈 문자열이나 빈 배열로 반환하세요. 장면은 문서에 있는 만큼 전부 빠짐없이 추출하세요.`;

type Params = { params: Promise<{ id: string }> };

async function setFailed(db: ReturnType<typeof getSupabaseAdmin>, id: string, message: string) {
  await db.from("conti_case_documents").update({
    status: "failed", error_message: message.slice(0, 500), updated_at: new Date().toISOString(),
  }).eq("id", id);
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY 미설정" }, { status: 500 });

  const db = getSupabaseAdmin();
  const { data: doc, error: docError } = await db.from("conti_case_documents").select("*").eq("id", id).maybeSingle();
  if (docError || !doc) return NextResponse.json({ ok: false, error: "사례를 찾을 수 없습니다." }, { status: 404 });

  await db.from("conti_case_documents").update({ status: "analyzing", error_message: null }).eq("id", id);

  try {
    const { data: signed, error: signError } = await db.storage.from(BUCKET).createSignedUrl(doc.storage_path, 3600);
    if (signError || !signed) throw new Error(signError?.message ?? "파일 URL 생성 실패");

    const fileRes = await fetch(signed.signedUrl);
    if (!fileRes.ok) throw new Error("파일 다운로드 실패");
    const base64 = Buffer.from(await fileRes.arrayBuffer()).toString("base64");

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25",
      },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
              { type: "text", text: "이 콘티 문서를 장면 단위로 분석해서 JSON으로 반환해주세요." },
            ],
          },
        ],
      }),
    });
    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      throw new Error(`AI 분석 실패: ${errText.slice(0, 300)}`);
    }

    const aiData = await anthropicRes.json();
    const raw: string = aiData.content?.[0]?.text ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("문서에서 콘티 구조를 인식할 수 없습니다.");

    const parsed = JSON.parse(jsonMatch[0]) as { document: ExtractedCaseDocument; scenes: ExtractedCaseScene[] };
    const extractedDoc = parsed.document ?? {};
    const scenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
    if (scenes.length === 0) throw new Error("추출된 장면이 없습니다.");

    const sceneTexts = scenes.map(buildSceneEmbeddingText);
    const docText = buildDocumentEmbeddingText(extractedDoc, scenes);
    const embeddings = await embedTexts([...sceneTexts, docText]);
    const sceneEmbeddings = embeddings?.slice(0, scenes.length) ?? [];
    const docEmbedding = embeddings?.[scenes.length] ?? null;

    const sceneRows = scenes.map((scene, index) => ({
      case_document_id: id,
      scene_order: scene.sceneOrder ?? index + 1,
      scene_name: scene.sceneName ?? "",
      scene_type: (SCENE_TYPES as readonly string[]).includes(scene.sceneType) ? scene.sceneType : "etc",
      department: scene.department ?? null,
      subjects: scene.subjects ?? [],
      location: scene.location ?? null,
      action: scene.action ?? null,
      camera_angle: scene.cameraAngle ?? null,
      shot_size: scene.shotSize ?? null,
      pose: scene.pose ?? null,
      props: scene.props ?? [],
      equipment: scene.equipment ?? [],
      direction: scene.direction ?? null,
      notes: scene.notes ?? null,
      embedding: sceneEmbeddings[index] ?? null,
    }));

    // 재분석(재시도)일 수 있으므로 기존 장면을 지우고 새로 넣는다 — 중복 축적 방지.
    await db.from("conti_case_scenes").delete().eq("case_document_id", id);
    const { error: insertError } = await db.from("conti_case_scenes").insert(sceneRows);
    if (insertError) throw new Error(insertError.message);

    const { data: updated, error: updateError } = await db
      .from("conti_case_documents")
      .update({
        clinic_name: extractedDoc.clinicName || doc.clinic_name,
        departments: extractedDoc.departments ?? [],
        shooting_type: extractedDoc.shootingType || null,
        doctor_count: extractedDoc.doctorCount ?? null,
        scene_count: scenes.length,
        metadata: { keywords: extractedDoc.keywords ?? [] },
        embedding: docEmbedding,
        status: "analyzed",
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (updateError || !updated) throw new Error(updateError?.message ?? "문서 갱신 실패");

    return NextResponse.json({ ok: true, document: rowToDocument(updated) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "분석 실패";
    console.error("[conti-library/analyze]", id, message);
    await setFailed(db, id, message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
