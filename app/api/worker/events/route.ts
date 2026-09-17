import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdminSession } from "@/lib/passkey";
import { isAuthorizedWorker } from "@/lib/remoteWorkerAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_EVENT_TYPES = new Set(["BACKUP_READY"]);
const ALLOWED_SOURCES = new Set(["NAS"]);

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

// Mac Studio nas-backup-watcher.ts가 감지한 BACKUP_READY 이벤트를 기록한다(§8).
export async function POST(request: NextRequest) {
  if (!isAuthorizedWorker(request)) {
    return Response.json({ ok: false, error: "Unauthorized worker" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  const workerId = optionalString(body.workerId);
  const eventType = optionalString(body.eventType);
  const source = optionalString(body.source) || "NAS";
  const sourceRoot = optionalString(body.sourceRoot);
  const folderName = optionalString(body.folderName);
  const fileCount = typeof body.fileCount === "number" && Number.isFinite(body.fileCount) ? Math.max(0, Math.trunc(body.fileCount)) : undefined;
  const totalBytes = typeof body.totalBytes === "number" && Number.isFinite(body.totalBytes) ? Math.max(0, Math.trunc(body.totalBytes)) : undefined;
  const detectedAt = optionalString(body.detectedAt);
  const readyAt = optionalString(body.readyAt);

  if (!workerId || !eventType || !sourceRoot || !folderName || fileCount === undefined || totalBytes === undefined || !detectedAt || !readyAt) {
    return Response.json({ ok: false, error: "workerId/eventType/sourceRoot/folderName/fileCount/totalBytes/detectedAt/readyAt가 모두 필요합니다." }, { status: 400 });
  }
  if (!ALLOWED_EVENT_TYPES.has(eventType)) {
    return Response.json({ ok: false, error: "지원하지 않는 eventType입니다." }, { status: 400 });
  }
  if (!ALLOWED_SOURCES.has(source)) {
    return Response.json({ ok: false, error: "지원하지 않는 source입니다." }, { status: 400 });
  }

  // §8 "중복 이벤트가 생성되지 않도록 eventKey 또는 idempotency key를 적용" — workerId+folderName+
  // detectedAt은 같은 백업 감지 사이클을 가리키므로, 전송 실패 후 재시도해도 행이 늘지 않는다.
  const eventKey = `${workerId}:${folderName}:${detectedAt}`;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("worker_events")
      .upsert(
        {
          worker_id: workerId,
          event_type: eventType,
          source,
          source_root: sourceRoot,
          folder_name: folderName,
          file_count: fileCount,
          total_bytes: totalBytes,
          event_key: eventKey,
          payload: { detectedAt, readyAt },
        },
        { onConflict: "event_key", ignoreDuplicates: true },
      )
      .select("id,status")
      .maybeSingle();

    if (error) throw error;

    // ignoreDuplicates:true면 이미 존재하는 행에는 data가 없다 — 그래도 idempotent 성공으로
    // 취급한다(§8 "전송 실패하면 BACKUP_READY 상태 유지 → 다음 loop에서 재전송"이 정상 동작하려면
    // 재전송이 에러가 아니라 성공으로 확인돼야 watcher가 SYNCED로 넘어간다).
    return Response.json({ ok: true, id: data?.id ?? null, status: data?.status ?? "PENDING" }, { status: data ? 201 : 200 });
  } catch (error) {
    console.error("[worker/events POST]", error);
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "이벤트 저장 실패" }, { status: 500 });
  }
}

// Olivia OS 알림 UI가 폴링하는 조회용 endpoint. 관리자 세션 인증만 허용한다(§13, 다른 Olivia
// 기능과 동일한 보호 수준).
export async function GET(request: NextRequest) {
  if (!isAdminSession(request)) {
    return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const statusParam = request.nextUrl.searchParams.get("status")?.trim().toUpperCase();
  const statuses = statusParam ? statusParam.split(",").filter(Boolean) : ["PENDING"];

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("worker_events")
      .select("id,worker_id,event_type,source,source_root,folder_name,file_count,total_bytes,status,payload,created_at,acknowledged_at")
      .in("status", statuses)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    return Response.json({ ok: true, events: data ?? [] });
  } catch (error) {
    console.error("[worker/events GET]", error);
    // §13 "Application Error 방지" — 알림 조회 실패가 다른 Olivia 기능에 영향을 주면 안 된다.
    // 500이어도 body는 항상 파싱 가능한 JSON이라 호출부가 안전하게 빈 목록으로 처리할 수 있다.
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "이벤트 조회 실패", events: [] }, { status: 500 });
  }
}
