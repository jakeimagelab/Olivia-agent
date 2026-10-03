import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { baseAudioMimeType, extensionFromMime, isUuid, VOICE_ORIGINAL_UPLOAD_MAX_BYTES, VOICE_RECORDINGS_BUCKET } from "@/lib/voice/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function numberInRange(value: unknown, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum ? value : null;
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "녹음 ID가 올바르지 않습니다." }, { status: 400 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const sequence = numberInRange(body.sequence, 0, 100_000);
    const startSeconds = numberInRange(body.startSeconds, 0, 24 * 60 * 60);
    const endSeconds = numberInRange(body.endSeconds, startSeconds ?? 0, 24 * 60 * 60);
    if (sequence === null || startSeconds === null || endSeconds === null) {
      return NextResponse.json({ error: "녹음 조각 순서와 시간을 확인해주세요." }, { status: 400 });
    }
    const supabase = getSupabaseAdmin();
    const { data: recording, error: recordingError } = await supabase
      .from("voice_recordings").select("recording_mode,status").eq("id", id).maybeSingle();
    if (recordingError) throw recordingError;
    if (!recording || recording.recording_mode !== "interview") return NextResponse.json({ error: "인터뷰 녹음 세션을 찾을 수 없습니다." }, { status: 404 });
    if (recording.status !== "recording" && recording.status !== "uploading") return NextResponse.json({ error: "종료된 인터뷰에는 새 녹음 조각을 추가할 수 없습니다." }, { status: 409 });

    const existingResult = await supabase.from("voice_recording_chunks").select("*").eq("recording_id", id).eq("sequence", sequence).maybeSingle();
    if (existingResult.error) throw existingResult.error;
    const existing = existingResult.data;
    if (body.uploaded === true) {
      if (!existing) return NextResponse.json({ error: "업로드를 확인할 녹음 조각이 없습니다." }, { status: 404 });
      // A signed-upload response alone is not a durable-storage confirmation.
      // Verify the private object before the database says this segment is safe.
      const pathDivider = existing.storage_path.lastIndexOf("/");
      const directory = existing.storage_path.slice(0, pathDivider);
      const fileName = existing.storage_path.slice(pathDivider + 1);
      const { data: storedObjects, error: storageError } = await supabase.storage
        .from(VOICE_RECORDINGS_BUCKET)
        .list(directory, { search: fileName });
      if (storageError || !storedObjects?.some((object) => object.name === fileName)) {
        await supabase.from("voice_recording_chunks").update({ status: "failed" }).eq("id", existing.id);
        return NextResponse.json({ error: "업로드된 녹음 조각을 저장소에서 확인하지 못했습니다." }, { status: 409 });
      }
      const { data, error } = await supabase.from("voice_recording_chunks").update({
        status: "uploaded",
        uploaded_at: new Date().toISOString(),
        size_bytes: numberInRange(body.sizeBytes, 0, VOICE_ORIGINAL_UPLOAD_MAX_BYTES) ?? existing.size_bytes,
        checksum: typeof body.checksum === "string" ? body.checksum.slice(0, 200) : existing.checksum,
      }).eq("id", existing.id).select("*").single();
      if (error) throw error;
      return NextResponse.json({ chunk: data, alreadyUploaded: existing.status === "uploaded" });
    }
    if (existing?.status === "uploaded") return NextResponse.json({ chunk: existing, alreadyUploaded: true });

    const mimeType = baseAudioMimeType(body.mimeType);
    const storagePath = `interviews/${id}/chunks/${String(sequence).padStart(4, "0")}.${extensionFromMime(mimeType)}`;
    const { data: chunk, error: chunkError } = existing
      ? await supabase.from("voice_recording_chunks").update({
        storage_path: storagePath, mime_type: mimeType, start_seconds: startSeconds, end_seconds: endSeconds,
        size_bytes: numberInRange(body.sizeBytes, 0, VOICE_ORIGINAL_UPLOAD_MAX_BYTES) ?? 0, status: "uploading",
      }).eq("id", existing.id).select("*").single()
      : await supabase.from("voice_recording_chunks").insert({
        recording_id: id, sequence, storage_path: storagePath, mime_type: mimeType, start_seconds: startSeconds,
        end_seconds: endSeconds, size_bytes: numberInRange(body.sizeBytes, 0, VOICE_ORIGINAL_UPLOAD_MAX_BYTES) ?? 0, status: "uploading",
      }).select("*").single();
    if (chunkError || !chunk) throw chunkError || new Error("녹음 조각을 준비하지 못했습니다.");
    const { data: signed, error: signedError } = await supabase.storage.from(VOICE_RECORDINGS_BUCKET).createSignedUploadUrl(storagePath, { upsert: true });
    if (signedError || !signed?.token) {
      await supabase.from("voice_recording_chunks").update({ status: "failed" }).eq("id", chunk.id);
      throw signedError || new Error("녹음 조각 업로드 주소를 만들지 못했습니다.");
    }
    await supabase.from("voice_recordings").update({ audio_status: "uploading", status: "uploading" }).eq("id", id);
    return NextResponse.json({ chunk, path: storagePath, uploadToken: signed.token, mimeType });
  } catch (error) {
    console.error("[voice/interview/chunk]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "녹음 조각 업로드를 준비하지 못했습니다." }, { status: 500 });
  }
}
