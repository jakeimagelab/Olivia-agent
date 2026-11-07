import { NextRequest } from "next/server";
import { resolveSharedPersonSelectAccess } from "@/lib/person-select/sharedPublic";
import { enforcePublicSelectionRateLimit, publicSelectionErrorResponse } from "@/lib/select-gallery/publicSelection";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await context.params;
  try {
    const db = getSupabaseAdmin();
    await enforcePublicSelectionRateLimit({ db, request, token: shareToken, action: "person-shared-message-events", limit: 30, windowSeconds: 60 });
    const { event } = await resolveSharedPersonSelectAccess(db, shareToken);
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
        send("ready", { eventId: event.id });
        heartbeat = setInterval(() => send("heartbeat", { at: new Date().toISOString() }), 15_000);
        channel = db
          .channel(`person-select-project-messages:${event.id}:${crypto.randomUUID()}`)
          .on("postgres_changes", {
            event: "INSERT",
            schema: "public",
            table: "person_select_project_messages",
            filter: `event_id=eq.${event.id}`,
          }, () => send("changed", { at: new Date().toISOString() }))
          .subscribe();
        request.signal.addEventListener("abort", close, { once: true });
      },
      cancel() { closeStream?.(); },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return publicSelectionErrorResponse(error);
  }
}
