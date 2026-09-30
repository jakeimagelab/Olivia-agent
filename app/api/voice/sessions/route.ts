import { NextRequest, NextResponse } from "next/server";
import { baseAudioMimeType, extensionFromMime, VOICE_RECORDINGS_BUCKET } from "@/lib/voice/config";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isUuid } from "@/lib/voice/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEVICE_TYPES = new Set(["iphone", "ipad", "android-mobile", "android-tablet", "desktop", "unknown"]);
const LIST_COLUMNS = "id,title,status,duration_seconds,summary,recorded_at,processed_at";

// docs/tablet-ipad-home-memo-voice-spec.md §6-7 — 지금까지 지난 녹음을 다시 찾아볼 방법이
// 없었다(조회 API 자체가 없었음). 목록은 가벼운 컬럼만 돌려주고(transcript_segments 등 큰
// 필드는 상세 조회(GET /api/voice/sessions/[id])에서만 가져온다), 최신순으로 최대 50건.
export async function GET(request: NextRequest) {
  const limitParam = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), 100) : 50;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("voice_recordings")
      .select(LIST_COLUMNS)
      .order("recorded_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return NextResponse.json({ recordings: data ?? [] });
  } catch (error) {
    console.error("[VOICE SESSIONS LIST]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "음성 기록 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const id = crypto.randomUUID();
    const mimeType = baseAudioMimeType(body.mimeType);
    const extension = extensionFromMime(mimeType);
    const deviceType = typeof body.deviceType === "string" && DEVICE_TYPES.has(body.deviceType)
      ? body.deviceType
      : "unknown";
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
    const now = new Date();
    const supabase = getSupabaseAdmin();

    // 기존 일반 녹음은 아래의 단일 Blob 업로드 경로를 그대로 쓴다. 인터뷰 모드만
    // 준비 완료 Snapshot을 검증한 뒤 chunk API로 분할 업로드한다.
    if (body.mode === "interview") {
      const preparationId = typeof body.preparationId === "string" ? body.preparationId : "";
      const versionId = typeof body.versionId === "string" ? body.versionId : "";
      if (!isUuid(preparationId) || !isUuid(versionId)) {
        return NextResponse.json({ error: "준비 완료된 인터뷰를 먼저 선택해주세요." }, { status: 400 });
      }
      const [{ data: preparation, error: preparationError }, { data: version, error: versionError }] = await Promise.all([
        supabase.from("voice_interview_preparations").select("*").eq("id", preparationId).maybeSingle(),
        supabase.from("voice_interview_preparation_versions").select("*").eq("id", versionId).eq("preparation_id", preparationId).maybeSingle(),
      ]);
      if (preparationError) throw preparationError;
      if (versionError) throw versionError;
      if (!preparation || preparation.status !== "ready" || preparation.current_version_id !== versionId || !version) {
        return NextResponse.json({ error: "현재 준비 완료된 인터뷰 질문 Snapshot을 찾을 수 없습니다." }, { status: 409 });
      }
      const { error: insertError } = await supabase.from("voice_recordings").insert({
        id,
        title: `${version.hospital_name} 인터뷰`,
        status: "recording",
        recording_mode: "interview",
        audio_status: "recording",
        analysis_status: "pending",
        device_type: deviceType,
        mime_type: mimeType,
        recorded_at: now.toISOString(),
        interview_preparation_id: preparationId,
        interview_version_id: versionId,
        client_id: preparation.client_id ?? null,
        workflow_run_id: preparation.workflow_run_id ?? null,
        interviewee_name: version.interviewee_name,
        selected_questions: version.selected_questions,
      });
      if (insertError) throw insertError;
      const { error: preparationUpdateError } = await supabase.from("voice_interview_preparations").update({
        status: "recording",
        recording_id: id,
        ready_error: null,
      }).eq("id", preparationId);
      if (preparationUpdateError) throw preparationUpdateError;
      return NextResponse.json({ id, mode: "interview", mimeType, selectedQuestions: version.selected_questions });
    }

    const path = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${id}.${extension}`;

    const { error: insertError } = await supabase.from("voice_recordings").insert({
      id,
      title: title || null,
      status: "recording",
      device_type: deviceType,
      mime_type: mimeType,
      audio_path: path,
      recorded_at: now.toISOString(),
    });
    if (insertError) throw insertError;

    const { data, error } = await supabase.storage
      .from(VOICE_RECORDINGS_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data?.token) {
      await supabase.from("voice_recordings").update({
        status: "error",
        error_message: error?.message || "Upload URL 생성 실패",
      }).eq("id", id);
      throw error || new Error("Upload URL 생성 실패");
    }

    return NextResponse.json({
      id,
      path,
      uploadToken: data.token,
      mimeType,
    });
  } catch (error) {
    console.error("[VOICE SESSION CREATE]", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "음성 세션 생성 실패",
    }, { status: 500 });
  }
}
