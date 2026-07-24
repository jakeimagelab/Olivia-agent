import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import {
  ensurePrimaryAssistantOwner,
  issueKakaoLinkCode,
} from "@/lib/assistant/owners/service";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "관리자 로그인이 필요합니다." },
    { status: 401 },
  );
}

export async function GET(req: NextRequest) {
  if (!isAdminSession(req)) return unauthorized();
  try {
    const db = getSupabaseAdmin();
    const owner = await ensurePrimaryAssistantOwner(db);
    const { data: connection, error } = await db
      .from("assistant_channel_connections")
      .select("id,status,connected_at,last_received_at,last_sent_at,metadata")
      .eq("owner_id", owner.id)
      .eq("channel", "kakao")
      .eq("status", "active")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return NextResponse.json({
      ok: true,
      owner: {
        id: owner.id,
        displayName: owner.display_name,
        role: owner.role,
      },
      connected: Boolean(connection),
      connection,
      configured: Boolean(
        process.env.KAKAO_BOT_ID &&
          process.env.KAKAO_REST_API_KEY &&
          process.env.KAKAO_SKILL_SECRET,
      ),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "카카오 연결 상태 조회에 실패했습니다.",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  if (!isAdminSession(req)) return unauthorized();
  try {
    const db = getSupabaseAdmin();
    const owner = await ensurePrimaryAssistantOwner(db);
    const linkCode = await issueKakaoLinkCode(db, owner.id);
    return NextResponse.json({ ok: true, ...linkCode });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "카카오 연결 코드 발급에 실패했습니다.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  if (!isAdminSession(req)) return unauthorized();
  try {
    const db = getSupabaseAdmin();
    const owner = await ensurePrimaryAssistantOwner(db);
    const { error } = await db
      .from("assistant_channel_connections")
      .update({
        status: "disconnected",
        disconnected_at: new Date().toISOString(),
      })
      .eq("owner_id", owner.id)
      .eq("channel", "kakao")
      .eq("status", "active");
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "카카오 연결 해제에 실패했습니다.",
      },
      { status: 500 },
    );
  }
}
