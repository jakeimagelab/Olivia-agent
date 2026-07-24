import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { hashAssistantSecret } from "@/lib/assistant/security";
import { getSupabaseAdmin } from "@/lib/supabase";

function safeEqual(value: string, expected: string) {
  const left = Buffer.from(value);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(req: NextRequest) {
  const adminKey = process.env.KAKAO_ADMIN_KEY;
  const authorization = req.headers.get("authorization") || "";
  if (
    !adminKey ||
    !safeEqual(authorization, `KakaoAK ${adminKey}`)
  ) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const resourceId = req.headers.get("x-kakao-resource-id")?.trim();
  if (!resourceId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  try {
    const body = await req.json();
    const event = body?.event;
    const id = typeof body?.id === "string" ? body.id : "";
    const idType = body?.id_type;
    if (
      !["added", "blocked"].includes(event) ||
      !id ||
      !["app_user_id", "open_id"].includes(idType)
    ) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const db = getSupabaseAdmin();
    const { error: eventError } = await db
      .from("assistant_webhook_events")
      .insert({
        provider: "kakao_channel",
        event_key: resourceId.slice(0, 200),
        payload_digest: hashAssistantSecret(
          `kakao-channel:${event}:${idType}:${id}`,
        ),
        sanitized_payload: {
          event,
          idType,
          channelPublicId: String(body.channel_public_id || "").slice(0, 100),
          updatedAt: String(body.updated_at || "").slice(0, 80),
        },
        status: "processing",
      });
    if (eventError?.code === "23505") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    if (eventError) throw new Error(eventError.message);

    if (idType === "app_user_id") {
      const appUserIdHash = hashAssistantSecret(`kakao:app:${id}`);
      await db
        .from("assistant_channel_connections")
        .update({
          status: event === "blocked" ? "blocked" : "active",
          disconnected_at:
            event === "blocked" ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("channel", "kakao")
        .eq("app_user_id_hash", appUserIdHash);
    }
    await db
      .from("assistant_webhook_events")
      .update({ status: "processed", processed_at: new Date().toISOString() })
      .eq("provider", "kakao_channel")
      .eq("event_key", resourceId.slice(0, 200));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
