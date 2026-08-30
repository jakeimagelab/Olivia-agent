import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { executeAgentTool } from "@/lib/olivia/v2/toolExecutor";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/olivia/v2/approve의 APPROVABLE_TOOLS와 별개의 allowlist다 — 그쪽은 "사람이 승인 카드의
// 확인 버튼을 눌렀다"는 의미론이고, 여기는 "채팅 인라인 카드(견적서 마법사 등)가 폼 제출/버튼
// 클릭으로 이미 알고 있는 도구를 곧장 실행한다"는 다른 신뢰 범주다 — approve의 allowlist를
// 섞으면 "승인이 필요한 민감한 작업" 신호가 흐려진다(견적서 UX 개편, 2026-08-31).
const INLINE_CARD_TOOLS = new Set(["create_quote", "apply_quote_discount", "resolve_quote_client", "link_new_client_to_quote"]);

export async function POST(req: NextRequest) {
  if (!isAdminSession(req)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const body = await req.json() as Record<string, unknown>;
  const toolName = typeof body.toolName === "string" ? body.toolName : "";
  if (!INLINE_CARD_TOOLS.has(toolName)) return NextResponse.json({ ok: false, error: "실행할 수 없는 작업입니다." }, { status: 400 });
  const input = body.toolInput && typeof body.toolInput === "object" && !Array.isArray(body.toolInput) ? body.toolInput : {};
  const context = body.context && typeof body.context === "object" && !Array.isArray(body.context) ? body.context as OliviaContextSnapshot : { recentActions: [], revision: 0 };
  const execution = await executeAgentTool({ id: crypto.randomUUID(), name: toolName, arguments: JSON.stringify(input) }, context);
  if (!execution.result.success) return NextResponse.json({ ok: false, error: execution.result.error || "작업에 실패했어요." }, { status: 400 });
  return NextResponse.json({ ok: true, result: execution.result.data, uiActions: execution.uiActions });
}
