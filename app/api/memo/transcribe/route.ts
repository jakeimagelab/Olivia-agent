import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createEventDeduplicationKey, emitOliviaEventSafely } from "@/lib/olivia/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

function outputText(json: any): string {
  if (typeof json.output_text === "string") return json.output_text;
  for (const item of json.output ?? []) for (const part of item.content ?? []) if (typeof part.text === "string") return part.text;
  return "";
}
export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "OPENAI_API_KEY 미설정" }, { status: 500 });
  try {
    const form = await req.formData();
    const audio = form.get("audio");
    const memoId = String(form.get("memo_id") || "");
    if (!(audio instanceof File)) return NextResponse.json({ ok: false, error: "audio 필드 없음" }, { status: 400 });
    if (audio.size > 50 * 1024 * 1024) return NextResponse.json({ ok: false, error: "음성 파일은 50MB까지 지원합니다." }, { status: 413 });

    const db = getSupabaseAdmin();
    await emitOliviaEventSafely(db, {
      eventType: "meeting.recording_uploaded",
      eventSource: "memo_transcribe_api",
      actorType: "admin",
      payload: { memoId: memoId || null, fileSize: audio.size, contentType: audio.type },
      deduplicationKey: memoId
        ? createEventDeduplicationKey("meeting.recording_uploaded", memoId, audio.size, audio.name)
        : null,
    });

    const upstream = new FormData();
    upstream.append("file", audio, audio.name || "recording.webm");
    upstream.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe");
    upstream.append("language", "ko");
    const transcriptionResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: upstream,
    });
    const transcription = await transcriptionResponse.json();
    if (!transcriptionResponse.ok) throw new Error(transcription.error?.message || "음성 텍스트 변환 실패");
    const transcript = String(transcription.text || "").trim();
    if (!transcript) throw new Error("인식된 음성이 없습니다.");

    const summaryResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MEMO_MODEL || "gpt-4.1-mini",
        instructions: "한국어 음성 메모를 간결하고 읽기 쉽게 정리하세요. 반드시 '핵심 내용', '결정 사항', '후속 작업' 세 구역으로 작성하고, 전사에 없는 사실은 만들지 마세요.",
        input: transcript,
      }),
    });
    const summaryJson = await summaryResponse.json();
    if (!summaryResponse.ok) throw new Error(summaryJson.error?.message || "음성 요약 실패");
    const summary = outputText(summaryJson).trim();

    if (memoId) {
      const { error } = await db.from("consultation_memos").update({ transcript, audio_summary: summary }).eq("id", memoId);
      if (error) throw error;
    }
    await emitOliviaEventSafely(db, {
      eventType: "meeting.transcribed",
      eventSource: "memo_transcribe_api",
      actorType: "admin",
      payload: { memoId: memoId || null, transcriptLength: transcript.length, hasSummary: Boolean(summary) },
      deduplicationKey: memoId
        ? createEventDeduplicationKey("meeting.transcribed", memoId, transcript.length)
        : null,
    });
    return NextResponse.json({ ok: true, text: transcript, transcript, summary });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "음성 처리 실패" }, { status: 500 });
  }
}
