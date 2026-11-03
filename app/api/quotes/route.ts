import { after, NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveClientId } from "@/lib/clientLookup";
import { logPortalEvent } from "@/lib/clientPortal";
import { registerClientCandidate } from "@/lib/olivia/clientCandidate";
import { hasMeaningfulQuoteContent } from "@/lib/quote/quoteDraft";
import { resolveWorkflowRunId } from "@/lib/workflowRunLookup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function quoteErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (message.includes("public.quotes") && message.includes("schema cache")) {
    return "견적 저장 DB가 아직 준비되지 않았습니다. Supabase SQL Editor에서 supabase/quotes-schema.sql을 실행해주세요.";
  }
  return message;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const prefix = searchParams.get("prefix");
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "10") || 10));

    if (prefix) {
      const { data, error } = await supabase
        .from("quotes")
        .select("quote_number")
        .ilike("quote_number", `${prefix}%`);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, quoteNumbers: (data ?? []).map((row) => row.quote_number as string) });
    }

    const { data, error } = await supabase
      .from("quotes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(Math.min(500, Math.max(limit * 5, limit)));

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    const quotes = (data ?? []).filter((row) => hasMeaningfulQuoteContent({
      hospitalName: row.hospital_name,
      items: row.items,
      totalAmount: row.total_amount,
    })).slice(0, limit);
    return NextResponse.json({ ok: true, quotes });
  } catch (error) {
    return NextResponse.json({ ok: false, error: quoteErrorMessage(error, "견적 조회 실패") }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();

    if (typeof body.quoteNumber !== "string" || !body.quoteNumber.trim()) {
      return NextResponse.json({ ok: false, error: "견적번호를 입력해주세요." }, { status: 400 });
    }
    if (!hasMeaningfulQuoteContent({
      hospitalName: body.hospitalName,
      items: body.items,
      totalAmount: body.totalAmount,
    })) {
      return NextResponse.json({ ok: false, skipped: true, error: "빈 견적은 저장하지 않습니다." }, { status: 400 });
    }

    const provided = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
    const quoteId = typeof body.quoteId === "string" && body.quoteId.trim() ? body.quoteId.trim() : null;
    let existing: {
      id: string;
      client_id: string | null;
      workflow_run_id: string | null;
      created_at: string;
      updated_at: string;
    } | null = null;

    if (quoteId) {
      const { data, error } = await supabase
        .from("quotes")
        .select("id,client_id,workflow_run_id,created_at,updated_at")
        .eq("id", quoteId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return NextResponse.json({ ok: false, error: "수정할 견적서를 찾을 수 없습니다." }, { status: 404 });
      existing = data;

      const requestedClientId = typeof body.clientId === "string" ? body.clientId : null;
      const requestedWorkflowRunId = typeof body.workflowRunId === "string" ? body.workflowRunId : null;
      if (provided("clientId") && requestedClientId !== (existing.client_id ?? null)) {
        return NextResponse.json({ ok: false, error: "현재 견적서의 고객 연결과 저장 요청이 다릅니다." }, { status: 409 });
      }
      if (provided("workflowRunId") && requestedWorkflowRunId !== (existing.workflow_run_id ?? null)) {
        return NextResponse.json({ ok: false, error: "현재 견적서의 촬영 건 연결과 저장 요청이 다릅니다." }, { status: 409 });
      }
      if (
        typeof body.lastKnownUpdatedAt === "string"
        && new Date(existing.updated_at).getTime() !== new Date(body.lastKnownUpdatedAt).getTime()
      ) {
        return NextResponse.json({
          ok: false,
          conflictDetected: true,
          error: "다른 곳에서 이 견적서가 먼저 수정됐습니다. 다시 불러온 뒤 저장해주세요.",
        }, { status: 409 });
      }
    }

    // 기존 문서는 DB에 저장된 소유 관계를 유지한다. 신규 문서만 명시 고객 또는 병원명으로 연결한다.
    const clientId = existing
      ? existing.client_id
      : body.clientId || await resolveClientId(supabase, body.hospitalName);
    const workflowRunId = existing
      ? existing.workflow_run_id
      : await resolveWorkflowRunId(supabase, body.workflowRunId, clientId);
    const payload = {
      quote_number:    body.quoteNumber,
      title:           body.title ?? "",
      hospital_name:   body.hospitalName ?? "",
      client_id:       clientId,
      workflow_run_id: workflowRunId,
      contact_name:    provided("contactName") ? body.contactName : "",
      phone:           provided("phone") ? body.phone : "",
      email:           provided("email") ? body.email : "",
      quote_date:      body.quoteDate ?? "",
      shoot_date:      body.shootDate ?? null,
      valid_until:     body.validUntil ?? "",
      items:           body.items ?? [],
      supply_amount:   body.supplyAmount ?? 0,
      discount_amount: body.discountAmount ?? 0,
      vat:             body.vat ?? 0,
      total_amount:    body.totalAmount ?? 0,
      deposit_amount:  body.depositAmount ?? 0,
      balance_amount:  body.balanceAmount ?? 0,
      deposit_rate:    body.depositRate ?? 50,
      package_id:      body.packageId ?? body.formState?.selectedPackageId ?? null,
      memos:           body.memos ?? null,
      form_state:      body.formState ?? null,
    };

    const nextUpdatedAt = new Date().toISOString();
    let saved: { id: string; created_at: string; updated_at: string } | null = null;
    if (existing) {
      // 조회 뒤 다른 저장이 끼어드는 경쟁도 updated_at 조건으로 막는다.
      const { data, error } = await supabase
        .from("quotes")
        .update({ ...payload, updated_at: nextUpdatedAt })
        .eq("id", existing.id)
        .eq("updated_at", existing.updated_at)
        .select("id,created_at,updated_at")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) {
        return NextResponse.json({
          ok: false,
          conflictDetected: true,
          error: "저장 중 다른 곳에서 견적서가 수정됐습니다. 다시 불러온 뒤 저장해주세요.",
        }, { status: 409 });
      }
      saved = data;
    } else {
      const { data, error } = await supabase
        .from("quotes")
        .insert(payload)
        .select("id,created_at,updated_at")
        .single();
      if (error) throw new Error(error.message);
      saved = data;
    }

    if (!saved) throw new Error("견적 저장 결과를 확인하지 못했습니다.");
    // 재시도로 같은 견적을 덮어쓸 때마다 알림이 쌓이지 않도록 신규 생성일 때만 포털에 기록한다.
    if (!existing && clientId) {
      await logPortalEvent({ clientId, eventType: "quote_ready", targetType: "quotes", targetId: saved.id }).catch((error) => { console.error("[OLIVIA] Suppressed promise rejection", error); });
    }
    if (!clientId && payload.hospital_name) {
      after(() => registerClientCandidate(supabase, {
        hospitalName: payload.hospital_name,
        sourceType: "quote",
        sourceRecordId: saved.id,
      }).catch((candidateError) => console.error("[quotes] 신규 고객 감지 실패", candidateError)));
    }
    // 저장(자동저장 포함)은 임시저장일 뿐 — 워크플로우 전진은 /api/quotes/[id]/publish
    // ("포털 공개")에서만 일어난다.
    return NextResponse.json({
      ok: true,
      id: saved.id,
      createdAt: saved.created_at,
      updatedAt: saved.updated_at,
      clientId,
      workflowRunId,
      updated: Boolean(existing),
      conflictDetected: false,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: quoteErrorMessage(error, "견적 저장 실패") }, { status: 500 });
  }
}
