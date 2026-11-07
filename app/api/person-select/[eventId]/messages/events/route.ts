import { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId } = await context.params;
  const db = getSupabaseAdmin();
  const { data: event, error } = await db.from("person_select_events").select("id,access_mode").eq("id", eventId).maybeSingle();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  if (!event || event.access_mode !== "project_shared") return Response.json({ ok: false, error: "공유 프로젝트를 찾을 수 없습니다." }, { status: 404 });

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let channel: ReturnType<typeof db.channel> | null = null;
  let closeStream: (() => void) | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (name: string, payload: unknown) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`)); }
        catch { closeStream?.(); }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (channel) void db.removeChannel(channel);
        try { controller.close(); } catch { /* already closed */ }
      };
      closeStream = close;
      send("ready", { eventId });
      heartbeat = setInterval(() => send("heartbeat", { at: new Date().toISOString() }), 15_000);
      channel = db
        .channel(`person-select-admin-messages:${eventId}:${crypto.randomUUID()}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "person_select_project_messages", filter: `event_id=eq.${eventId}` }, () => send("changed", { at: new Date().toISOString() }))
        .subscribe();
      request.signal.addEventListener("abort", close, { once: true });
    },
    cancel() { closeStream?.(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
