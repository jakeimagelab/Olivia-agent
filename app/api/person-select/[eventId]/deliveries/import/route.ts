import type { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getConfiguredWorkerId } from "@/lib/remoteWorkerAuth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function safeSourcePath(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) throw new Error("보정본 폴더를 선택해 주세요.");
  const next = value.trim();
  if (next.split(/[\\/]/u).some((segment) => segment === "..")) throw new Error("허용 루트 밖의 경로는 사용할 수 없습니다.");
  return next;
}

export async function POST(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId } = await context.params;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  let sourceRelativePath: string;
  try { sourceRelativePath = safeSourcePath(body.sourcePath ?? body.source_relative_path); }
  catch (error) { return Response.json({ ok: false, error: error instanceof Error ? error.message : "보정본 폴더를 확인해 주세요." }, { status: 400 }); }
  const db = getSupabaseAdmin();
  const { data: event } = await db.from("person_select_events").select("id,title").eq("id", eventId).maybeSingle();
  if (!event) return Response.json({ ok: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  const { data: active } = await db.from("remote_jobs").select("id,status,progress,result,error")
    .eq("action", "PERSON_SELECT_DELIVERY_IMPORT")
    .eq("payload->>event_id", eventId)
    .in("status", ["QUEUED", "RUNNING"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (active) return Response.json({ ok: true, job: active, reused: true });
  const { data, error } = await db.from("remote_jobs").insert({
    action: "PERSON_SELECT_DELIVERY_IMPORT",
    payload: { event_id: eventId, source_relative_path: sourceRelativePath },
    target_worker: getConfiguredWorkerId(),
    status: "QUEUED",
  }).select("id,status,progress,result,error").single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
  return Response.json({ ok: true, job: data, reused: false });
}
