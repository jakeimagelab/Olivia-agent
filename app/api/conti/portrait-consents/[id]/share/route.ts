import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { hashPortraitConsentToken, isUuid } from "@/lib/portraitConsent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TTL_DAYS = 30;

// POST — 초상권 제공자에게 전달할 포털 링크(토큰) 생성/재발급.
// 원본 토큰은 이 응답에서만 한 번 내려주고, DB에는 해시만 저장한다 (파일이 아닌 포털 전달 요구사항).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ ok: false, error: "id가 올바르지 않습니다." }, { status: 400 });

    const db = getSupabaseAdmin();
    const { data: existing, error: fetchError } = await db
      .from("portrait_consents").select("id, status").eq("id", id).maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    if (!existing) return NextResponse.json({ ok: false, error: "동의서를 찾을 수 없습니다." }, { status: 404 });
    if (existing.status === "signed") {
      return NextResponse.json({ ok: false, error: "이미 서명이 완료된 동의서입니다." }, { status: 400 });
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashPortraitConsentToken(token);
    const expiresAt = new Date(Date.now() + DEFAULT_TTL_DAYS * 86400000).toISOString();

    const { error } = await db
      .from("portrait_consents")
      .update({
        token_hash: tokenHash,
        token_expires_at: expiresAt,
        token_revoked_at: null,
        status: "sent",
      })
      .eq("id", id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, token, expiresAt });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "링크 생성 실패" }, { status: 500 });
  }
}

// DELETE — 발급된 포털 링크 취소 (제공자가 더 이상 서명할 수 없게 함).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ ok: false, error: "id가 올바르지 않습니다." }, { status: 400 });

    const db = getSupabaseAdmin();
    const { error } = await db
      .from("portrait_consents")
      .update({ token_revoked_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "취소 실패" }, { status: 500 });
  }
}
