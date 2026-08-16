import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveWorkflowRunId } from "@/lib/workflowRunLookup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// 견적 Workspace Modal의 resourceId 기반 불러오기(기존 견적서를 다시 편집) 용도로 추가한
// 단건 조회 라우트 — 지금까지는 목록(GET /api/quotes) / 발행(POST /api/quotes/[id]/publish)만 있었다.
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("quotes").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "견적서를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ ok: true, quote: data });
}

// 고객 등록 전에 미리 만든 견적서를 실제 고객에 연결한다(app/api/conti/saves/route.ts의
// PATCH와 같은 목적 — 병원명 오타 등으로 POST 시점의 resolveClientId 자동매칭이 실패했을 때,
// 사람이 명시적으로 고른 clientId는 그 제약 없이 그대로 신뢰한다).
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const { clientId, hospitalName } = await req.json();
  if (!clientId) return NextResponse.json({ ok: false, error: "clientId 필요" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: client, error: clientError } = await supabase
    .from("clients").select("id, hospital_name").eq("id", clientId).maybeSingle();
  if (clientError) return NextResponse.json({ ok: false, error: clientError.message }, { status: 500 });
  if (!client) return NextResponse.json({ ok: false, error: "고객을 찾을 수 없습니다." }, { status: 404 });

  const workflowRunId = await resolveWorkflowRunId(supabase, undefined, clientId);
  const { error } = await supabase
    .from("quotes")
    .update({ hospital_name: hospitalName || client.hospital_name, client_id: clientId, workflow_run_id: workflowRunId })
    .eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, clientId, workflowRunId, hospitalName: hospitalName || client.hospital_name });
}
