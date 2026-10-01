import { NextRequest, NextResponse } from "next/server";
import { baseAudioMimeType, extensionFromMime, VOICE_RECORDINGS_BUCKET } from "@/lib/voice/config";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isUuid } from "@/lib/voice/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEVICE_TYPES = new Set(["iphone", "ipad", "android-mobile", "android-tablet", "desktop", "unknown"]);
const LIST_COLUMNS = "id,title,status,recording_mode,duration_seconds,summary,recorded_at,processed_at";

function normalizeCaptureQuality(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const requestedSampleRate = source.requestedSampleRate === 48_000 ? 48_000 : null;
  const requestedChannelCount = source.requestedChannelCount === 1 ? 1 : null;
  const requestedBitsPerSecond = source.requestedBitsPerSecond === 128_000 ? 128_000 : null;
  if (!requestedSampleRate || !requestedChannelCount || !requestedBitsPerSecond) return null;
  const actualNumber = (key: "actualSampleRate" | "actualChannelCount" | "actualBitsPerSecond") => (
    typeof source[key] === "number" && Number.isFinite(source[key]) && source[key] >= 0
      ? Math.floor(source[key] as number)
      : null
  );
  return {
    requestedSampleRate,
    requestedChannelCount,
    requestedBitsPerSecond,
    actualSampleRate: actualNumber("actualSampleRate"),
    actualChannelCount: actualNumber("actualChannelCount"),
    actualBitsPerSecond: actualNumber("actualBitsPerSecond"),
    mimeType: typeof source.mimeType === "string" ? baseAudioMimeType(source.mimeType) : null,
  };
}

async function insertVoiceRecording(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  values: Record<string, unknown>,
  captureQuality: ReturnType<typeof normalizeCaptureQuality>,
) {
  const withQuality = captureQuality ? { ...values, capture_quality: captureQuality } : values;
  let { error } = await supabase.from("voice_recordings").insert(withQuality);

  // The client rollout must not block recording when the code reaches an
  // environment before its additive migration. PostgREST rejects an unknown
  // column before inserting anything, so retrying once without metadata cannot
  // create a duplicate source recording. The next migration-enabled request
  // will retain the requested/actual capture settings as intended.
  if (error && captureQuality && (error.code === "PGRST204" || error.message.includes("capture_quality"))) {
    console.warn("[VOICE SESSION CREATE] capture_quality migration is not applied; recording without quality metadata.");
    ({ error } = await supabase.from("voice_recordings").insert(values));
  }
  if (error) throw error;
}

// docs/tablet-ipad-home-memo-voice-spec.md §6-7 — 지금까지 지난 녹음을 다시 찾아볼 방법이
// 없었다(조회 API 자체가 없었음). 목록은 가벼운 컬럼만 돌려주고(transcript_segments 등 큰
// 필드는 상세 조회(GET /api/voice/sessions/[id])에서만 가져온다), 최신순으로 최대 50건.
export async function GET(request: NextRequest) {
  const limitParam = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), 100) : 50;
  const mode = request.nextUrl.searchParams.get("mode");

  try {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("voice_recordings")
      .select(LIST_COLUMNS)
      .order("recorded_at", { ascending: false })
      .limit(limit);
    if (mode === "interview" || mode === "general") query = query.eq("recording_mode", mode);
    const { data, error } = await query;
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
    const captureQuality = normalizeCaptureQuality(body.captureQuality);
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
      await insertVoiceRecording(supabase, {
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
      }, captureQuality);
      const { error: preparationUpdateError } = await supabase.from("voice_interview_preparations").update({
        status: "recording",
        recording_id: id,
        ready_error: null,
      }).eq("id", preparationId);
      if (preparationUpdateError) throw preparationUpdateError;
      return NextResponse.json({ id, mode: "interview", mimeType, selectedQuestions: version.selected_questions });
    }

    const path = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${id}.${extension}`;

    await insertVoiceRecording(supabase, {
      id,
      title: title || null,
      status: "recording",
      device_type: deviceType,
      mime_type: mimeType,
      audio_path: path,
      recorded_at: now.toISOString(),
    }, captureQuality);

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
