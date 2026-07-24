import { NextRequest, NextResponse } from "next/server";
import { ensurePrimaryAssistantOwner } from "@/lib/assistant/owners/service";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

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
    const { data, error } = await db
      .from("assistant_notification_settings")
      .upsert({ owner_id: owner.id }, { onConflict: "owner_id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, settings: data });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "알림 설정 조회에 실패했습니다.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  if (!isAdminSession(req)) return unauthorized();
  try {
    const body = await req.json();
    const booleanFields = [
      "morning_enabled",
      "afternoon_enabled",
      "evening_enabled",
      "quiet_hours_enabled",
      "important_email_enabled",
      "calendar_enabled",
      "photo_enabled",
      "project_delay_enabled",
      "system_error_enabled",
      "kakao_enabled",
      "web_enabled",
    ] as const;
    const timeFields = [
      "morning_time",
      "afternoon_time",
      "evening_time",
      "quiet_hours_start",
      "quiet_hours_end",
    ] as const;
    const patch: Record<string, boolean | string> = {};
    for (const field of booleanFields) {
      if (field in body) {
        if (typeof body[field] !== "boolean") {
          return NextResponse.json(
            { ok: false, error: `${field} 값이 올바르지 않습니다.` },
            { status: 400 },
          );
        }
        patch[field] = body[field];
      }
    }
    for (const field of timeFields) {
      if (field in body) {
        const value = String(body[field] || "").slice(0, 5);
        if (!TIME_PATTERN.test(value)) {
          return NextResponse.json(
            { ok: false, error: `${field} 시간 형식이 올바르지 않습니다.` },
            { status: 400 },
          );
        }
        patch[field] = value;
      }
    }
    const db = getSupabaseAdmin();
    const owner = await ensurePrimaryAssistantOwner(db);
    const { data, error } = await db
      .from("assistant_notification_settings")
      .upsert({ owner_id: owner.id, ...patch }, { onConflict: "owner_id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, settings: data });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "알림 설정 저장에 실패했습니다.",
      },
      { status: 500 },
    );
  }
}
