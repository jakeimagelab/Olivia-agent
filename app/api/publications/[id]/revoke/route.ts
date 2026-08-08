import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { recordPcrmActivitySafely } from "@/lib/pcrm/activity";
import { PUBLICATION_TYPE_LABEL, type PublicationType } from "@/lib/clientWorkspace/publications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const db = getSupabaseAdmin();

  const { data: pub, error: fetchError } = await db
    .from("pcrm_publications")
    .select("id, client_id, workflow_run_id, related_type, related_id, title")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
  if (!pub) return NextResponse.json({ ok: false, error: "공개 기록을 찾을 수 없습니다." }, { status: 404 });

  const { error } = await db.from("pcrm_publications").update({
    status: "revoked", revoked_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const label = pub.title || PUBLICATION_TYPE_LABEL[pub.related_type as PublicationType] || pub.related_type;
  await recordPcrmActivitySafely(db, {
    clientId: pub.client_id,
    workflowRunId: pub.workflow_run_id,
    actorType: "admin",
    actorName: "관리자",
    actionType: `${pub.related_type}_revoked`,
    title: `${label} 공개가 중지됨`,
    relatedType: pub.related_type,
    relatedId: pub.related_id,
  });

  return NextResponse.json({ ok: true });
}
