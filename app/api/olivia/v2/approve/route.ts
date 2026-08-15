import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { executeAgentTool } from "@/lib/olivia/v2/toolExecutor";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPROVABLE_TOOLS = new Set(["apply_quote_rebalance", "publish_quote", "apply_remove_conti_shot", "apply_send_mailing", "apply_feature_record_write"]);

export async function POST(req: NextRequest) {
  if (!isAdminSession(req)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const body = await req.json() as Record<string, unknown>;
  const toolName = typeof body.toolName === "string" ? body.toolName : "";
  if (!APPROVABLE_TOOLS.has(toolName)) return NextResponse.json({ ok: false, error: "승인할 수 없는 작업입니다." }, { status: 400 });
  const input = body.toolInput && typeof body.toolInput === "object" && !Array.isArray(body.toolInput) ? body.toolInput : {};
  const context = body.context && typeof body.context === "object" && !Array.isArray(body.context) ? body.context as OliviaContextSnapshot : { recentActions: [], revision: 0 };
  const execution = await executeAgentTool({ id: String(body.approvalId || crypto.randomUUID()), name: toolName, arguments: JSON.stringify(input) }, context);
  if (!execution.result.success) return NextResponse.json({ ok: false, error: execution.result.error || "승인 작업에 실패했어요." }, { status: 400 });
  return NextResponse.json({ ok: true, result: execution.result.data, uiActions: execution.uiActions });
}
