import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { moveAllRecordsToTrash } from "@/lib/trash";

export const dynamic = "force-dynamic";

// GET /api/olivia/messages?limit=60&since=ISO&source=telegram
export async function GET(req: NextRequest) {
  const db = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const limit  = Math.min(parseInt(searchParams.get("limit") || "60"), 200);
  const since  = searchParams.get("since");
  const source = searchParams.get("source");

  const buildQuery = (includeMetadata: boolean) => {
    let q = db
    .from("olivia_chat_messages")
    .select(includeMetadata ? "id, created_at, role, content, source, metadata" : "id, created_at, role, content, source")
    .order("created_at", { ascending: false })
    .limit(limit);

    if (since)  q = q.gt("created_at", since);
    if (source) q = q.eq("source", source);
    return q;
  };

  let { data, error } = await buildQuery(true);
  if (error && /metadata|column/i.test(error.message)) {
    ({ data, error } = await buildQuery(false));
  }
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, messages: (data ?? []).reverse() });
}

// POST /api/olivia/messages
// body: { messages: [{role, content, source?}] }  또는  { role, content, source? }
export async function POST(req: NextRequest) {
  const db   = getSupabaseAdmin();
  const body = await req.json();

  const items: any[] = body.messages ?? [{ role: body.role, content: body.content, source: body.source }];

  const rows = items
    .filter((m) => m?.role && m?.content)
    .map((m) => ({
      role: m.role,
      content: m.content,
      source: m.source ?? "web",
      metadata: sanitizeMetadata(m.metadata),
    }));

  if (!rows.length) return NextResponse.json({ ok: true });

  let { data, error } = await db
    .from("olivia_chat_messages")
    .insert(rows)
    .select("id, created_at, role, content, source");
  if (error && /metadata|column/i.test(error.message)) {
    ({ data, error } = await db
      .from("olivia_chat_messages")
      .insert(rows.map(({ metadata: _metadata, ...row }) => row))
      .select("id, created_at, role, content, source"));
  }
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, messages: data ?? [] });
}

function sanitizeMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return {};
  const workItems = Array.isArray((metadata as any).workItems)
    ? (metadata as any).workItems.slice(0, 12).map((item: any) => ({
        id: String(item.id || "").slice(0, 80),
        kind: String(item.kind || "").slice(0, 30),
        title: String(item.title || "").slice(0, 160),
        summary: String(item.summary || "").slice(0, 500),
        clientName: item.clientName ? String(item.clientName).slice(0, 120) : undefined,
        projectName: item.projectName ? String(item.projectName).slice(0, 160) : undefined,
        workflowRunId: item.workflowRunId ? String(item.workflowRunId).slice(0, 80) : undefined,
        status: item.status ? String(item.status).slice(0, 40) : undefined,
        dueAt: item.dueAt ? String(item.dueAt).slice(0, 40) : undefined,
        availableActions: Array.isArray(item.availableActions)
          ? item.availableActions.slice(0, 8).map((action: unknown) => String(action).slice(0, 30))
          : ["view"],
        metadata: item.metadata && typeof item.metadata === "object" ? {
          calendarTaskId: item.metadata.calendarTaskId ? String(item.metadata.calendarTaskId).slice(0, 80) : undefined,
          memoId: item.metadata.memoId ? String(item.metadata.memoId).slice(0, 80) : undefined,
          connectionStatus: item.metadata.connectionStatus ? String(item.metadata.connectionStatus).slice(0, 30) : undefined,
          matchingWorkflowRunIds: Array.isArray(item.metadata.matchingWorkflowRunIds)
            ? item.metadata.matchingWorkflowRunIds.slice(0, 10).map((id: unknown) => String(id).slice(0, 80))
            : undefined,
          eventId: item.metadata.eventId ? String(item.metadata.eventId).slice(0, 80) : undefined,
          insightId: item.metadata.insightId ? String(item.metadata.insightId).slice(0, 80) : undefined,
          hospitalName: item.metadata.hospitalName ? String(item.metadata.hospitalName).slice(0, 120) : undefined,
          sourceType: item.metadata.sourceType ? String(item.metadata.sourceType).slice(0, 30) : undefined,
          sourceRecordId: item.metadata.sourceRecordId ? String(item.metadata.sourceRecordId).slice(0, 80) : undefined,
          suggestedStep: item.metadata.suggestedStep ? String(item.metadata.suggestedStep).slice(0, 40) : undefined,
        } : undefined,
      })).filter((item: any) => item.id && item.kind)
    : [];
  const deviceId = typeof (metadata as any).deviceId === "string" ? (metadata as any).deviceId.slice(0, 80) : undefined;
  const clientRequestId = typeof (metadata as any).clientRequestId === "string" ? (metadata as any).clientRequestId.slice(0, 100) : undefined;
  return {
    ...(workItems.length ? { workItems } : {}),
    ...(deviceId ? { deviceId } : {}),
    ...(clientRequestId ? { clientRequestId } : {}),
  };
}

// DELETE /api/olivia/messages  — 전체 삭제 (초기화)
export async function DELETE() {
  const db = getSupabaseAdmin();
  try {
    const item = await moveAllRecordsToTrash(db, "olivia_chat");
    return NextResponse.json({ ok: true, trashId: item?.id ?? null });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "대화 기록 삭제 실패" }, { status: 500 });
  }
}
