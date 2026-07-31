import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { cleanText, isUuid, sanitizeFieldList } from "@/lib/portraitConsent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ ok: false, error: "id가 올바르지 않습니다." }, { status: 400 });

    const db = getSupabaseAdmin();
    const { data, error } = await db.from("portrait_consents").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ ok: false, error: "동의서를 찾을 수 없습니다." }, { status: 404 });

    return NextResponse.json({ ok: true, consent: data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "조회 실패" }, { status: 500 });
  }
}

// PATCH — 제목/안내문/세부항목/활용목적 수정. 서명 완료 후에도 관리자가 오탈자 등을 고칠 수 있어야
// 한다는 요청에 따라 상태와 무관하게 허용한다(서명 자체·서명일·동의 여부는 이 라우트로 건드리지 않는다).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ ok: false, error: "id가 올바르지 않습니다." }, { status: 400 });

    const db = getSupabaseAdmin();
    const { data: existing, error: fetchError } = await db
      .from("portrait_consents").select("status").eq("id", id).maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    if (!existing) return NextResponse.json({ ok: false, error: "동의서를 찾을 수 없습니다." }, { status: 404 });

    const body = await req.json();
    const update: Record<string, unknown> = {};
    if (typeof body.title === "string") update.title = cleanText(body.title, 200) || "초상권 동의서";
    if (typeof body.introText === "string") update.intro_text = cleanText(body.introText, 2000);
    if (Array.isArray(body.detailFields)) update.detail_fields = sanitizeFieldList(body.detailFields);
    if (Array.isArray(body.usageItems)) update.usage_items = sanitizeFieldList(body.usageItems);
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: false, error: "수정할 내용이 없습니다." }, { status: 400 });
    }

    const { data, error } = await db
      .from("portrait_consents").update(update).eq("id", id).select("*").single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, consent: data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "수정 실패" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ ok: false, error: "id가 올바르지 않습니다." }, { status: 400 });

    const db = getSupabaseAdmin();
    const { error } = await db.from("portrait_consents").delete().eq("id", id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "삭제 실패" }, { status: 500 });
  }
}
