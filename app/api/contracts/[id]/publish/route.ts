import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ensurePortalAccess } from "@/lib/clientPortal";
import { recordPcrmActivitySafely } from "@/lib/pcrm/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 계약서는 견적 공개 단계에서 이미 만들어진 프로젝트(고객/워크플로우)에 붙는 문서라
// 여기서 새 프로젝트를 만들지 않는다 — 연결된 프로젝트가 없으면 먼저 견적서 흐름을
// 통해 프로젝트를 만들라고 안내한다.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getSupabaseAdmin();
  const body = await req.json().catch(() => ({} as any));

  const { data: contract, error: contractError } = await db.from("contracts").select("*").eq("id", id).maybeSingle();
  if (contractError) return NextResponse.json({ ok: false, error: contractError.message }, { status: 500 });
  if (!contract) return NextResponse.json({ ok: false, error: "계약서를 찾을 수 없습니다." }, { status: 404 });

  try {
    const clientId: string | null = contract.client_id ?? body.clientId ?? null;
    const workflowRunId: string | null = contract.workflow_run_id ?? body.workflowRunId ?? null;
    if (!clientId || !workflowRunId) {
      return NextResponse.json(
        { ok: false, error: "계약서에 연결된 프로젝트가 없습니다. 먼저 견적서를 공개해 프로젝트를 생성해주세요." },
        { status: 400 },
      );
    }

    if (contract.client_id !== clientId || contract.workflow_run_id !== workflowRunId) {
      await db.from("contracts").update({ client_id: clientId, workflow_run_id: workflowRunId }).eq("id", id);
    }

    const now = new Date().toISOString();
    const { data: existingPub } = await db
      .from("pcrm_publications")
      .select("id, version, status")
      .eq("workflow_run_id", workflowRunId)
      .eq("related_type", "contract")
      .eq("related_id", id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingPub && existingPub.status === "draft") {
      await db.from("pcrm_publications").update({ status: "published", published_at: now, published_by: "admin", updated_at: now }).eq("id", existingPub.id);
    } else if (existingPub) {
      await db.from("pcrm_publications").insert({
        client_id: clientId,
        workflow_run_id: workflowRunId,
        related_type: "contract",
        related_id: id,
        title: "계약서",
        version: existingPub.version + 1,
        status: "published",
        published_at: now,
        published_by: "admin",
        created_by: "admin",
      });
    } else {
      await db.from("pcrm_publications").insert({
        client_id: clientId,
        workflow_run_id: workflowRunId,
        related_type: "contract",
        related_id: id,
        title: "계약서",
        status: "published",
        published_at: now,
        published_by: "admin",
        created_by: "admin",
      });
    }

    // 포털은 고객 단위 1개만 재사용, 만료일 없음(위 quote publish 라우트와 동일 방침).
    const portal = await ensurePortalAccess({ clientId, email: contract.email || undefined });
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://olivia.photoclinic.kr";
    const portalUrl = `${baseUrl}/client-portal/access/${portal.token}`;

    await recordPcrmActivitySafely(db, {
      clientId,
      workflowRunId,
      actorType: "admin",
      actorName: "관리자",
      actionType: "contract_published",
      title: "계약서가 고객 포털에 공개됨",
      relatedType: "contract",
      relatedId: id,
    });

    return NextResponse.json({ ok: true, clientId, workflowRunId, portalUrl });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "계약서 공개 실패" }, { status: 500 });
  }
}
