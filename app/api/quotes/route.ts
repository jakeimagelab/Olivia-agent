import { after, NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveClientId } from "@/lib/clientLookup";
import { logPortalEvent } from "@/lib/clientPortal";
import { registerClientCandidate } from "@/lib/olivia/clientCandidate";
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
      .limit(limit);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, quotes: data ?? [] });
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

    const clientId = body.clientId || await resolveClientId(supabase, body.hospitalName);
    const workflowRunId = await resolveWorkflowRunId(supabase, body.workflowRunId, clientId);

    const payload = {
      quote_number:    body.quoteNumber,
      title:           body.title ?? "",
      hospital_name:   body.hospitalName ?? "",
      client_id:       clientId,
      workflow_run_id: workflowRunId,
      contact_name:    body.contactName ?? "",
      phone:           body.phone ?? "",
      email:           body.email ?? "",
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
      memos:           body.memos ?? null,
      form_state:      body.formState ?? null,
    };

    const { data: existing, error: findError } = await supabase
      .from("quotes")
      .select("id, updated_at")
      .eq("quote_number", body.quoteNumber)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (findError) throw new Error(findError.message);

    // 사람의 저장(수동/자동)과 Agent tool의 직접 DB write가 서로 다른 경로로 같은 행을 건드릴
    // 수 있다(§45/46) — 여기서는 막지 않고(하드 리젝트는 이 충돌을 다루는 기존 테스트가 없어
    // false-positive로 정상 저장까지 막을 위험이 더 크다고 판단) 감지만 해서 알려준다.
    // updated_at 컬럼에는 지금까지 UPDATE 시 자동 갱신 트리거가 없었으므로 여기서 직접 채운다.
    const conflictDetected = Boolean(
      existing?.id && typeof body.lastKnownUpdatedAt === "string" && existing.updated_at &&
      new Date(existing.updated_at).getTime() !== new Date(body.lastKnownUpdatedAt).getTime()
    );
    if (conflictDetected) {
      console.warn("[quotes] 저장 충돌 감지 — 다른 곳에서 먼저 저장됨", {
        quoteId: existing!.id,
        knownUpdatedAt: body.lastKnownUpdatedAt,
        actualUpdatedAt: existing!.updated_at,
      });
    }

    const query = existing?.id
      ? supabase.from("quotes").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", existing.id)
      : supabase.from("quotes").insert(payload);
    const { data, error } = await query.select("id, created_at, updated_at").single();

    if (error) throw new Error(error.message);
    // 재시도로 같은 견적을 덮어쓸 때마다 알림이 쌓이지 않도록 신규 생성일 때만 포털에 기록한다.
    if (!existing?.id && clientId) {
      await logPortalEvent({ clientId, eventType: "quote_ready", targetType: "quotes", targetId: data.id }).catch(() => {});
    }
    if (!clientId && payload.hospital_name) {
      after(() => registerClientCandidate(supabase, {
        hospitalName: payload.hospital_name,
        sourceType: "quote",
        sourceRecordId: data.id,
      }).catch((candidateError) => console.error("[quotes] 신규 고객 감지 실패", candidateError)));
    }
    // 저장(자동저장 포함)은 임시저장일 뿐 — 워크플로우 전진은 /api/quotes/[id]/publish
    // ("포털 공개")에서만 일어난다.
    return NextResponse.json({ ok: true, id: data.id, createdAt: data.created_at, updatedAt: data.updated_at, updated: Boolean(existing?.id), conflictDetected });
  } catch (error) {
    return NextResponse.json({ ok: false, error: quoteErrorMessage(error, "견적 저장 실패") }, { status: 500 });
  }
}
