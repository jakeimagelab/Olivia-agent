import { after, NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { moveRecordToTrash } from "@/lib/trash";
import { resolveClientId } from "@/lib/clientLookup";
import { logPortalEvent } from "@/lib/clientPortal";
import { registerClientCandidate } from "@/lib/olivia/clientCandidate";
import { resolveWorkflowRunId } from "@/lib/workflowRunLookup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("conti_saves")
      .select("id, hospital_name, specialties, title, saved_at, result, client_id, workflow_run_id")
      .order("saved_at", { ascending: false })
      .limit(20);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { hospitalName, specialties, title, result, clientId: requestedClientId, workflowRunId: requestedRunId, id: requestedId } = await req.json();
    const db = getSupabaseAdmin();
    const clientId = requestedClientId || await resolveClientId(db, hospitalName);
    const workflowRunId = await resolveWorkflowRunId(db, requestedRunId, clientId);

    // 이미 저장한 레코드의 id를 알고 있으면(모달 자동저장 등 반복 저장) 그 id로 바로 업데이트한다
    // — 병원명만으로 "기존 것 찾기"를 매번 반복하면, 병원명이 같거나 비어있는(기본값 "병원명
    // 없음") 서로 다른 고객의 콘티가 같은 행으로 합쳐질 위험이 있다(견적번호 충돌 버그와 동일한
    // 종류의 문제).
    const { data: existing } = requestedId
      ? await db.from("conti_saves").select("id").eq("id", requestedId).maybeSingle()
      : await db
          .from("conti_saves")
          .select("id")
          .eq("hospital_name", hospitalName || "병원명 없음")
          .single();

    if (existing?.id) {
      const { error } = await db
        .from("conti_saves")
        .update({ specialties, title, result, client_id: clientId, workflow_run_id: workflowRunId, saved_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      if (!clientId && hospitalName) {
        after(() => registerClientCandidate(db, { hospitalName, sourceType: "conti", sourceRecordId: existing.id })
          .catch((candidateError) => console.error("[conti] 신규 고객 감지 실패", candidateError)));
      }
      // 저장(자동저장 포함)은 임시저장일 뿐 — 워크플로우 전진은 "공개" 버튼
      // (/api/publications/by-type/conti/[id]/publish)에서만 일어난다.
      return NextResponse.json({ ok: true, id: existing.id });
    }

    const { data, error } = await db.from("conti_saves").insert({
      hospital_name: hospitalName || "병원명 없음",
      specialties: specialties || [],
      title: title || "",
      result,
      client_id: clientId,
      workflow_run_id: workflowRunId,
    }).select("id").single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (clientId) {
      await logPortalEvent({ clientId, eventType: "conti_ready", targetType: "conti_saves", targetId: data.id, workflowRunId }).catch(() => {});
    }
    if (!clientId && hospitalName) {
      after(() => registerClientCandidate(db, { hospitalName, sourceType: "conti", sourceRecordId: data.id })
        .catch((candidateError) => console.error("[conti] 신규 고객 감지 실패", candidateError)));
    }
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, hospitalName } = await req.json();
    if (!id) return NextResponse.json({ ok: false, error: "id 필요" }, { status: 400 });
    const db = getSupabaseAdmin();
    const { error } = await db
      .from("conti_saves")
      .update({ hospital_name: hospitalName })
      .eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id 필요" }, { status: 400 });

    const db = getSupabaseAdmin();
    const item = await moveRecordToTrash(db, "conti_save", id);
    return NextResponse.json({ ok: true, trashId: item.id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
