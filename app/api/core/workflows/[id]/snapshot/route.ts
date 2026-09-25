import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { isAdminSession } from "@/lib/passkey";
import { getCoreProjectSnapshot } from "@/lib/core/readModels/projectSnapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const workflowRunIdSchema = z.string().uuid();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAdminSession(request)) {
    return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const parsed = workflowRunIdSchema.safeParse((await params).id);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "올바른 프로젝트 ID가 필요합니다.", code: "INVALID_PROJECT_ID" }, { status: 400 });
  }

  const result = await getCoreProjectSnapshot(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.reason, code: result.code }, {
      status: result.code === "PROJECT_NOT_FOUND" ? 404 : 500,
    });
  }
  return NextResponse.json({ ok: true, snapshot: result.value });
}
