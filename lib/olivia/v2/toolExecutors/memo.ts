import type { OliviaContextSnapshot, OliviaToolResult } from "@/lib/olivia/v2/types";
import { callOliviaApi } from "./http";
import { text } from "./common";
import { createVerification } from "./verification";

export const MEMO_TOOL_NAMES = ["memo_create", "memo_list", "memo_search", "memo_get", "memo_update"] as const;

async function getMemo(memoId: string) {
  const payload = await callOliviaApi<{ ok: boolean; memo: Record<string, unknown> }>(`/api/memo?id=${encodeURIComponent(memoId)}`);
  return payload.memo;
}

export async function executeMemoTool(name: string, input: Record<string, unknown>, context: OliviaContextSnapshot): Promise<OliviaToolResult> {
  if (name === "memo_get") {
    const memoId = text(input, "memoId") || context.activeResourceId;
    if (!memoId) throw new Error("조회할 메모 ID가 필요해요.");
    const memo = await getMemo(memoId);
    return { tool: name, success: true, data: { memoId, resourceId: memoId, memo }, verification: createVerification({ executed: true, resourceExists: true }) };
  }

  if (name === "memo_list" || name === "memo_search") {
    const query = new URLSearchParams();
    const contextType = text(input, "contextType");
    const contextId = text(input, "contextId") || context.activeClientId;
    if (contextType && contextId) { query.set("context_type", contextType); query.set("context_id", contextId); }
    const payload = await callOliviaApi<{ ok: boolean; memos: Array<Record<string, unknown>> }>(`/api/memo${query.size ? `?${query}` : ""}`);
    const keyword = text(input, "query").toLowerCase();
    // When the optional context columns are not migrated yet, /api/memo falls
    // back to the legacy row shape. Client memos can still be scoped safely by
    // the canonical hospital_id instead of returning unrelated global rows.
    const scoped = contextType && contextId
      ? payload.memos.filter((memo) => contextType === "client"
        ? memo.context_id === contextId || memo.hospital_id === contextId
        : memo.context_type === contextType && memo.context_id === contextId)
      : payload.memos;
    const memos = name === "memo_search" && keyword
      ? scoped.filter((memo) => [memo.title, memo.raw_memo, memo.summary].some((value) => String(value || "").toLowerCase().includes(keyword)))
      : scoped;
    return { tool: name, success: true, data: { memos }, verification: createVerification({ executed: true }) };
  }

  if (name === "memo_create" || name === "memo_update") {
    const memoId = name === "memo_update" ? text(input, "memoId") || context.activeResourceId : "";
    if (name === "memo_update" && !memoId) throw new Error("수정할 메모 ID가 필요해요.");
    const content = text(input, "content");
    if (!content) throw new Error("메모 내용을 입력해주세요.");
    const clientId = text(input, "clientId") || context.activeClientId || "";
    const contextType = text(input, "contextType") || (clientId ? "client" : "");
    const contextId = text(input, "contextId") || clientId || "";
    if (name === "memo_create" && !clientId && !contextId && input.independent !== true) {
      throw new Error("메모를 연결할 고객이나 업무를 먼저 확정해주세요. 독립 메모를 요청한 경우에만 independent=true를 사용합니다.");
    }
    const payload = await callOliviaApi<{ ok: boolean; memo: Record<string, unknown> }>("/api/memo", {
      method: "POST",
      body: JSON.stringify({
        action: "save",
        id: memoId || undefined,
        hospital_id: clientId || null,
        context_type: contextType || null,
        context_id: contextId || null,
        title: text(input, "title") || content.slice(0, 60),
        raw_memo: content,
        template_type: "text",
      }),
    });
    const savedId = String(payload.memo.id || memoId);
    const readBack = await getMemo(savedId);
    if (readBack.raw_memo !== content) throw new Error("메모 저장 검증 값이 요청과 일치하지 않아요.");
    if (clientId && readBack.hospital_id !== clientId && !(readBack.context_type === "client" && readBack.context_id === clientId)) throw new Error("메모 고객 연결 검증 값이 요청과 일치하지 않아요.");
    if (contextId && contextType && (readBack.context_type !== contextType || readBack.context_id !== contextId) && !(contextType === "client" && readBack.hospital_id === contextId)) throw new Error("메모 컨텍스트 연결 검증 값이 요청과 일치하지 않아요.");
    return { tool: name, success: true, data: { memoId: savedId, resourceId: savedId, memo: readBack, summary: name === "memo_create" ? "메모를 저장했어요." : "메모를 수정했어요." }, verification: createVerification({ executed: true, persisted: true, resourceExists: true, linked: Boolean(clientId || contextId) }) };
  }

  throw new Error("지원하지 않는 Olivia 작업이에요.");
}
