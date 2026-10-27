import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import { ensurePrimaryAssistantOwner } from "@/lib/assistant/owners/service";
import { listAssistantMessages, saveAssistantMessage } from "@/lib/assistant/conversations/service";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { executeAgentTool } from "@/lib/olivia/v2/toolExecutor";
import { CLIENT_CHAT_TOOLS } from "@/lib/olivia/clientChatTools";
import { normalizeToolError } from "@/lib/olivia/output/errorMessages";
import type { OliviaContextSnapshot, OliviaToolCall } from "@/lib/olivia/v2/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
}

async function getClientConversation(db: ReturnType<typeof getSupabaseAdmin>, ownerId: string, clientId: string, hospitalName: string) {
  const { data: existing, error } = await db.from("assistant_conversations")
    .select("id,owner_id")
    .eq("owner_id", ownerId)
    .eq("client_id", clientId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing;

  const { data: created, error: createError } = await db.from("assistant_conversations")
    .insert({ owner_id: ownerId, client_id: clientId, status: "active", title: `${hospitalName} 전용`, metadata: { scope: "client", clientId } })
    .select("id,owner_id")
    .single();
  if (createError?.code === "23505") {
    const { data: concurrent, error: concurrentError } = await db.from("assistant_conversations")
      .select("id,owner_id").eq("owner_id", ownerId).eq("client_id", clientId).eq("status", "active").single();
    if (concurrentError || !concurrent) throw concurrentError ?? new Error("고객 대화를 준비하지 못했습니다.");
    return concurrent;
  }
  if (createError || !created) throw createError ?? new Error("고객 대화를 준비하지 못했습니다.");
  return created;
}

async function loadClientScope(db: ReturnType<typeof getSupabaseAdmin>, clientId: string, workflowRunId?: string | null) {
  const { data: client, error } = await db.from("clients")
    .select("id,hospital_name,specialty,contact_name,phone")
    .eq("id", clientId)
    .maybeSingle();
  if (error || !client) throw new Error("이 고객 정보를 불러오지 못했습니다.");

  const [{ data: quote }, { data: contract }, { data: run }] = await Promise.all([
    db.from("quotes").select("id,workflow_run_id").eq("client_id", clientId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("contracts").select("id,workflow_run_id").eq("client_id", clientId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    workflowRunId
      ? db.from("workflow_runs").select("id,project_name").eq("id", workflowRunId).eq("client_id", clientId).maybeSingle()
      : db.from("workflow_runs").select("id,project_name").eq("client_id", clientId).eq("status", "active")
          .order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return { client, quoteId: quote?.id ?? null, contractId: contract?.id ?? null, run: run ?? null };
}

async function refusalForOtherClient(db: ReturnType<typeof getSupabaseAdmin>, clientId: string, message: string, currentHospital: string) {
  const { data } = await db.from("clients").select("id,hospital_name").neq("id", clientId).is("archived_at", null);
  const mentioned = (data ?? []).find((row) => row.hospital_name && message.includes(row.hospital_name));
  return mentioned ? `여기는 ${currentHospital} 전용입니다. ${mentioned.hospital_name} 작업은 그 고객 화면에서 진행해 주세요.` : null;
}

function forcedInput(call: OliviaToolCall, scope: Awaited<ReturnType<typeof loadClientScope>>) {
  let input: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(call.arguments || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) input = parsed;
  } catch {
    input = {};
  }
  // 모델이 다른 ID를 보내도 화면이 고정한 고객만 사용한다.
  input.clientId = scope.client.id;
  if (call.name === "get_quote") input.quoteId = scope.quoteId;
  if (call.name === "get_contract") input.contractId = scope.contractId;
  if (call.name === "create_contract") {
    input.hospitalName = scope.client.hospital_name;
    input.quoteId = scope.quoteId;
  }
  return input;
}

export async function GET(req: NextRequest) {
  if (!isAdminSession(req)) return unauthorized();
  try {
    const clientId = new URL(req.url).searchParams.get("clientId");
    if (!clientId) return NextResponse.json({ ok: false, error: "고객이 선택되지 않았습니다." }, { status: 400 });
    const db = getSupabaseAdmin();
    const owner = await ensurePrimaryAssistantOwner(db);
    const scope = await loadClientScope(db, clientId);
    const conversation = await getClientConversation(db, owner.id, clientId, scope.client.hospital_name);
    const messages = await listAssistantMessages(db, owner.id, conversation.id, 100);
    return NextResponse.json({ ok: true, conversationId: conversation.id, messages });
  } catch (error) {
    const normalized = normalizeToolError(error, "이 고객의 대화를 불러오지 못했습니다.");
    console.error("[client-chat:get]", normalized.logDetail);
    return NextResponse.json({ ok: false, error: normalized.userMessage }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAdminSession(req)) return unauthorized();
  try {
    const body = await req.json();
    const clientId = String(body.clientId || "");
    const message = String(body.message || "").trim();
    const documentType = ["quote", "contract", "conti"].includes(body.documentType) ? String(body.documentType) : null;
    if (!clientId || !message) return NextResponse.json({ ok: false, error: "고객과 메시지를 확인해 주세요." }, { status: 400 });

    const db = getSupabaseAdmin();
    const owner = await ensurePrimaryAssistantOwner(db);
    const scope = await loadClientScope(db, clientId, body.workflowRunId || null);
    const conversation = await getClientConversation(db, owner.id, clientId, scope.client.hospital_name);
    const history = await listAssistantMessages(db, owner.id, conversation.id, 24);
    await saveAssistantMessage(db, {
      ownerId: owner.id, conversationId: conversation.id, role: "user", content: message, channel: "web",
      metadata: { scope: "client", clientId, documentType },
    });

    const refusal = await refusalForOtherClient(db, clientId, message, scope.client.hospital_name);
    if (refusal) {
      const saved = await saveAssistantMessage(db, {
        ownerId: owner.id, conversationId: conversation.id, role: "assistant", content: refusal, channel: "web",
        metadata: { scope: "client", clientId, documentType, refusedOtherClient: true },
      });
      return NextResponse.json({ ok: true, message: saved.message, executedTools: [] });
    }

    if (!process.env.OPENAI_API_KEY) throw new Error("AI 연결을 준비하지 못했습니다.");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const context: OliviaContextSnapshot = {
      pathname: "/clients",
      activeClientId: clientId,
      activeClientName: scope.client.hospital_name,
      activeClientSource: "screen",
      activeProjectId: scope.run?.id,
      activeProjectName: scope.run?.project_name,
      activeWorkspace: documentType || undefined,
      activeResourceId: documentType === "contract" ? scope.contractId ?? undefined : scope.quoteId ?? undefined,
      currentDocumentType: documentType || undefined,
      currentDocumentId: documentType === "contract" ? scope.contractId ?? undefined : documentType === "quote" ? scope.quoteId ?? undefined : undefined,
      currentRequestText: message,
      currentConversationId: conversation.id,
      recentActions: [], revision: 0,
    };
    const input = [
      ...history.slice(-18).map((row) => ({ role: row.role === "assistant" ? "assistant" as const : "user" as const, content: row.content })),
      { role: "user" as const, content: message },
    ];
    const instructions = `당신은 ${scope.client.hospital_name} 전용 업무 채팅입니다. 현재 고객 ID는 ${clientId}이며 절대 바꾸거나 추측하지 않습니다. ${documentType ? `현재 문서는 ${documentType}입니다.` : "현재 문서가 열려 있지 않습니다."} 제공된 도구만 사용하고, 저장하지 않은 일을 완료했다고 말하지 마세요. 다른 고객 작업은 거절하세요. 답변은 짧고 자연스러운 한국어로 작성하세요.`;
    let response = await openai.responses.create({
      model: process.env.OLIVIA_DEFAULT_MODEL || process.env.OLIVIA_FAST_MODEL || "gpt-5-mini",
      instructions,
      input,
      tools: CLIENT_CHAT_TOOLS,
      parallel_tool_calls: false,
    });
    const executedTools: Array<{ name: string; success: boolean }> = [];
    let finalText = response.output_text || "";

    for (let round = 0; round < 4; round += 1) {
      const calls = response.output.filter((item) => item.type === "function_call").map((item) => ({
        id: item.call_id, name: item.name, arguments: item.arguments || "{}",
      }));
      if (!calls.length) break;
      const outputs: ResponseInputItem[] = [];
      for (const call of calls) {
        const safeCall = { ...call, arguments: JSON.stringify(forcedInput(call, scope)) };
        const callWorkspace = call.name.includes("contract") ? "contract" : call.name.includes("quote") ? "quote" : context.activeWorkspace;
        const callResourceId = callWorkspace === "contract" ? scope.contractId : callWorkspace === "quote" ? scope.quoteId : context.activeResourceId;
        const execution = await executeAgentTool(safeCall, {
          ...context,
          activeWorkspace: callWorkspace || undefined,
          activeResourceId: callResourceId || undefined,
          currentDocumentType: callWorkspace || context.currentDocumentType,
          currentDocumentId: callResourceId || context.currentDocumentId,
        });
        executedTools.push({ name: call.name, success: execution.result.success });
        outputs.push({ type: "function_call_output", call_id: call.id, output: JSON.stringify(execution.result) });
      }
      response = await openai.responses.create({
        model: process.env.OLIVIA_DEFAULT_MODEL || process.env.OLIVIA_FAST_MODEL || "gpt-5-mini",
        instructions,
        previous_response_id: response.id,
        input: outputs,
        tools: CLIENT_CHAT_TOOLS,
        parallel_tool_calls: false,
      });
      finalText = response.output_text || finalText;
      if (executedTools.length && executedTools.slice(-calls.length).every((item) => !item.success)) break;
    }

    if (!finalText.trim()) {
      finalText = executedTools.some((tool) => tool.success)
        ? "요청한 내용을 반영했습니다."
        : "요청한 작업을 마치지 못했습니다. 내용을 확인한 뒤 다시 시도해 주세요.";
    }
    const saved = await saveAssistantMessage(db, {
      ownerId: owner.id, conversationId: conversation.id, role: "assistant", content: finalText, channel: "web",
      metadata: { scope: "client", clientId, documentType, executedTools },
    });
    return NextResponse.json({ ok: true, message: saved.message, executedTools });
  } catch (error) {
    const normalized = normalizeToolError(error, "요청한 작업을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    console.error("[client-chat:post]", normalized.logDetail);
    return NextResponse.json({ ok: false, error: normalized.userMessage }, { status: 500 });
  }
}
