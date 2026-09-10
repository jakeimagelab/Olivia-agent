import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateAssistantConversation } from "@/lib/assistant/conversations/service";
import { ensurePrimaryAssistantOwner } from "@/lib/assistant/owners/service";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!isAdminSession(req)) {
    return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const db = getSupabaseAdmin();
  const owner = await ensurePrimaryAssistantOwner(db);
  const conversation = await getOrCreateAssistantConversation(db, owner.id);
  const requestedConversationId = req.nextUrl.searchParams.get("conversationId");
  if (requestedConversationId && requestedConversationId !== conversation.id) {
    return NextResponse.json({ ok: false, error: "현재 대화가 아닙니다." }, { status: 409 });
  }

  const encoder = new TextEncoder();
  let cleanup = () => undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: string, data: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      const channel = db
        .channel(`olivia-server:${conversation.id}:${randomUUID()}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "olivia_chat_messages",
            filter: `conversation_id=eq.${conversation.id}`,
          },
          () => send("changed", { conversationId: conversation.id }),
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") send("ready", { conversationId: conversation.id });
        });
      const heartbeat = setInterval(() => send("heartbeat", { at: Date.now() }), 20_000);
      const onAbort = () => cleanup();
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        req.signal.removeEventListener("abort", onAbort);
        void db.removeChannel(channel);
        try { controller.close(); } catch { /* already closed */ }
      };
      req.signal.addEventListener("abort", onAbort, { once: true });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
