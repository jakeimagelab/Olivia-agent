import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { DiagnosisChannel } from "@/lib/hospitalBrandDiagnosis/types";
import {
  HBD_ALLOWED_MIME_TYPES, HBD_MAX_FILES_PER_CHANNEL, ensureHbdBucket, extensionForMime, maxSizeForMime,
} from "@/lib/hospitalBrandDiagnosis/storage";
import { HBD_STORAGE_BUCKET } from "@/lib/hospitalBrandDiagnosis/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_CHANNELS: DiagnosisChannel[] = ["website", "naver_place", "naver_blog", "instagram", "youtube", "other"];
const UUID_RE_TOP = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// 사진/영상 업로드 — 섹션 11: 사용자 동의(consent=true) 없이는 저장하지 않는다.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const diagnosisId = String(form.get("diagnosisId") || "");
    const channel = String(form.get("channel") || "") as DiagnosisChannel;
    const category = form.get("category") ? String(form.get("category")) : null;
    const consent = form.get("consent") === "true";

    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "파일이 없습니다." }, { status: 400 });
    if (!diagnosisId) return NextResponse.json({ ok: false, error: "diagnosisId가 필요합니다." }, { status: 400 });
    if (!VALID_CHANNELS.includes(channel)) return NextResponse.json({ ok: false, error: "채널 값이 올바르지 않습니다." }, { status: 400 });
    if (!consent) return NextResponse.json({ ok: false, error: "업로드 동의가 필요합니다." }, { status: 400 });
    if (!HBD_ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json({ ok: false, error: "지원하지 않는 파일 형식입니다. (JPG/PNG/WEBP, MP4/MOV/WEBM만 가능)" }, { status: 400 });
    }
    if (file.size <= 0 || file.size > maxSizeForMime(file.type)) {
      return NextResponse.json({ ok: false, error: "파일 용량이 허용 범위를 벗어났습니다." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: diagnosis, error: diagnosisError } = await supabase
      .from("hospital_brand_diagnoses").select("id").eq("id", diagnosisId).maybeSingle();
    if (diagnosisError) throw diagnosisError;
    if (!diagnosis) return NextResponse.json({ ok: false, error: "진단 세션을 찾을 수 없습니다." }, { status: 404 });

    const { count, error: countError } = await supabase
      .from("hospital_brand_diagnosis_assets")
      .select("id", { count: "exact", head: true })
      .eq("diagnosis_id", diagnosisId).eq("channel", channel);
    if (countError) throw countError;
    if ((count ?? 0) >= HBD_MAX_FILES_PER_CHANNEL) {
      return NextResponse.json({ ok: false, error: `채널당 최대 ${HBD_MAX_FILES_PER_CHANNEL}개까지 업로드할 수 있습니다.` }, { status: 400 });
    }

    await ensureHbdBucket(supabase);

    // 파일명을 Storage 경로에 그대로 쓰지 않고 UUID 기반 경로를 사용한다 (섹션 10).
    const assetId = randomUUID();
    const storagePath = `${diagnosisId}/${channel}/${assetId}.${extensionForMime(file.type)}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage.from(HBD_STORAGE_BUCKET).upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const { data: asset, error: insertError } = await supabase
      .from("hospital_brand_diagnosis_assets")
      .insert({
        id: assetId,
        diagnosis_id: diagnosisId,
        channel,
        category,
        file_name: file.name.slice(0, 180),
        storage_path: storagePath,
        mime_type: file.type,
        file_size: file.size,
        consent: true,
      })
      .select("id, channel, category, file_name, storage_path, mime_type, file_size, consent, created_at")
      .single();
    if (insertError) {
      await supabase.storage.from(HBD_STORAGE_BUCKET).remove([storagePath]);
      throw insertError;
    }

    return NextResponse.json({ ok: true, asset });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "파일 업로드 실패" }, { status: 500 });
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// 섹션 12: AI가 분류한 이미지 카테고리를 사용자가 수정할 수 있어야 한다.
// 섹션 4-2(보완): 클라이언트에서 영상 키프레임 추출을 마친 뒤, 영상 자산 자체의
// 분석 범위(VideoAnalysisSummary)를 analysis_json에 기록할 때도 이 엔드포인트를 재사용한다.
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const assetId = String(body.assetId || "");
    if (!assetId || !UUID_RE.test(assetId)) {
      return NextResponse.json({ ok: false, error: "assetId가 올바르지 않습니다." }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (body.category !== undefined) {
      const category = String(body.category || "");
      if (!category) return NextResponse.json({ ok: false, error: "category가 필요합니다." }, { status: 400 });
      patch.category = category;
    }
    if (body.videoAnalysisSummary && typeof body.videoAnalysisSummary === "object") {
      patch.analysis_json = body.videoAnalysisSummary;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: false, error: "수정할 내용이 없습니다." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("hospital_brand_diagnosis_assets").update(patch).eq("id", assetId);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "자산 정보 수정 실패" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const assetId = searchParams.get("assetId");
    if (!assetId) return NextResponse.json({ ok: false, error: "assetId가 필요합니다." }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data: asset, error: findError } = await supabase
      .from("hospital_brand_diagnosis_assets").select("storage_path").eq("id", assetId).maybeSingle();
    if (findError) throw findError;
    if (!asset) return NextResponse.json({ ok: true });

    await supabase.storage.from(HBD_STORAGE_BUCKET).remove([asset.storage_path]);
    const { error: deleteError } = await supabase.from("hospital_brand_diagnosis_assets").delete().eq("id", assetId);
    if (deleteError) throw deleteError;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "파일 삭제 실패" }, { status: 500 });
  }
}
