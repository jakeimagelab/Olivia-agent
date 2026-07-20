import { NextRequest, NextResponse } from "next/server";
import { validatePortalToken } from "@/lib/clientPortal";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 견적서/계약서 PDF를 고객 포털에서 다운로드할 수 있게 해주는 라우트.
// 관리자용 /api/workflow-artifacts/[id]/access와 달리, 포털 토큰을 검증하고
// 그 토큰의 고객이 소유한 자료인지(client_id 일치)까지 확인해야 한다 —
// 그렇지 않으면 다른 고객의 자료 ID를 추측해서 다운로드할 수 있다.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.headers.get("x-portal-token") ?? "";
  const session = await validatePortalToken(token);
  if (!session) return NextResponse.json({ ok: false, error: "인증 필요" }, { status: 401 });

  const db = getSupabaseAdmin();
  const { id } = await params;
  const { data: artifact, error } = await db.from("workflow_artifacts")
    .select("storage_path,file_name,status,client_id")
    .eq("id", id)
    .maybeSingle();
  if (error || !artifact || artifact.status !== "ready" || artifact.client_id !== session.clientId) {
    return NextResponse.json({ ok: false, error: "원본 파일을 찾지 못했습니다." }, { status: 404 });
  }

  const { data, error: signError } = await db.storage.from("workflow-artifacts")
    .createSignedUrl(artifact.storage_path, 120, { download: artifact.file_name });
  if (signError || !data?.signedUrl) {
    return NextResponse.json({ ok: false, error: "파일 접근 주소를 만들지 못했습니다." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, url: data.signedUrl, fileName: artifact.file_name });
}
