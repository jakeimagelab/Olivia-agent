import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { cleanText, isUuid, resolvePortraitConsentLinkUpdate, sanitizeFieldList } from "@/lib/portraitConsent";
import { validatePortraitConsentLink } from "@/lib/portraitConsentLinkServer";

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

// PATCH — 서명 전에는 본문과 연결 정보를 수정한다. 서명 완료 후에는 서명 당시 본문을
// 보존하고 업무 분류용 고객/촬영 건 연결만 변경할 수 있다.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ ok: false, error: "id가 올바르지 않습니다." }, { status: 400 });

    const db = getSupabaseAdmin();
    const { data: existing, error: fetchError } = await db
      .from("portrait_consents").select("status, client_id, workflow_run_id").eq("id", id).maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    if (!existing) return NextResponse.json({ ok: false, error: "동의서를 찾을 수 없습니다." }, { status: 404 });

    const body = await req.json();
    const contentRequested = typeof body.title === "string"
      || typeof body.introText === "string"
      || Array.isArray(body.detailFields)
      || Array.isArray(body.usageItems);
    if (existing.status === "signed" && contentRequested) {
      return NextResponse.json(
        { ok: false, error: "서명 완료 문서는 내용을 수정할 수 없습니다." },
        { status: 409 },
      );
    }

    const update: Record<string, unknown> = {};
    if (typeof body.title === "string") update.title = cleanText(body.title, 200) || "초상권 동의서";
    if (typeof body.introText === "string") update.intro_text = cleanText(body.introText, 2000);
    if (Array.isArray(body.detailFields)) update.detail_fields = sanitizeFieldList(body.detailFields);
    if (Array.isArray(body.usageItems)) update.usage_items = sanitizeFieldList(body.usageItems);
    const link = resolvePortraitConsentLinkUpdate(body, {
      clientId: existing.client_id,
      workflowRunId: existing.workflow_run_id,
    });
    if (link.error) return NextResponse.json({ ok: false, error: link.error }, { status: 400 });
    if (link.requested) {
      const linkError = await validatePortraitConsentLink(db, link);
      if (linkError) return NextResponse.json({ ok: false, error: linkError }, { status: 400 });
      update.client_id = link.clientId;
      update.workflow_run_id = link.workflowRunId;
    }
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
