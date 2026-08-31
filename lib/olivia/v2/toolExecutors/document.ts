import { getSupabaseAdmin } from "@/lib/supabase";
import { parseKoreanCount } from "@/lib/olivia/naturalLanguageNumbers";
import { fuzzyNameSearchOne } from "@/lib/olivia/nameSearch";
import { resolveFeatureIntent } from "@/lib/olivia/features/resolver";
import { OLIVIA_FALLBACK_MESSAGES } from "@/lib/olivia/output/errorMessages";
import { searchDocuments } from "@/lib/olivia/documents/searchDocuments";
import { DOCUMENT_TYPE_LABELS, normalizeDocumentTypeHint, type OliviaDocumentRef } from "@/lib/olivia/documents/types";
import type { OliviaContextSnapshot, OliviaToolResult } from "@/lib/olivia/v2/types";
import { text } from "./common";
import { createVerification } from "./verification";

function toDocSummary(doc: OliviaDocumentRef) {
  return {
    id: doc.id,
    type: doc.type,
    typeLabel: DOCUMENT_TYPE_LABELS[doc.type],
    title: doc.title,
    clientName: doc.clientName ?? undefined,
    projectName: doc.projectName ?? undefined,
    status: doc.status ?? undefined,
    updatedAt: doc.updatedAt ?? undefined,
  };
}

export const DOCUMENT_TOOL_NAMES = ["open_feature", "search_documents", "get_recent_documents", "open_document"] as const;

export async function executeDocumentTool(
  name: string,
  input: Record<string, unknown>,
  context: OliviaContextSnapshot,
): Promise<OliviaToolResult> {
  const db = getSupabaseAdmin();

  // ── 화면 전환 ──
  if (name === "open_feature") {
    const query = text(input, "featureQuery");
    const resolution = resolveFeatureIntent(query);
    if (resolution.kind === "match") {
      let href = resolution.tool.href;
      // "OO병원 고객관리 페이지 열어줘"처럼 고객명이 함께 오면, 고객 목록만 여는 게 아니라 그
      // 고객이 바로 선택된 화면으로 딥링크한다 — /clients?clientId=만 이 방식을 지원 확인됨
      // (다른 화면은 고객별 진입점이 없어 아직 못 한다, 2026-08-16 사용자 리포트).
      const hospitalName = text(input, "hospitalName");
      if (hospitalName && href === "/clients") {
        const client = await fuzzyNameSearchOne<{ id: string; hospital_name: string }>({
          db, table: "clients", nameColumn: "hospital_name", select: "id, hospital_name", query: hospitalName,
        });
        if (client) href = `/clients?clientId=${encodeURIComponent(client.id)}`;
      }
      // 0.85 미만(완전 일치가 아닌 애매한 매칭)은 바로 열지 않고 한 문장으로 확인부터 하도록
      // needsConfirmation을 신호로 보낸다 — 시스템 프롬프트가 이 값을 보고 확인 질문을 한다.
      if (resolution.confidence < 0.85) {
        return {
          tool: name,
          success: true,
          data: { matched: false, needsConfirmation: true, featureName: resolution.tool.title, href, confidence: resolution.confidence },
          verification: createVerification({ executed: true }),
        };
      }
      return { tool: name, success: true, data: { matched: true, featureName: resolution.tool.title, href }, verification: createVerification({ executed: true }) };
    }
    if (resolution.kind === "ambiguous") {
      return {
        tool: name,
        success: true,
        data: { matched: false, ambiguous: true, candidates: resolution.candidates.map((candidate) => candidate.title) },
        verification: createVerification({ executed: true }),
      };
    }
    // kind === "none" — 완전히 못 찾았어도 근접 후보가 있으면 dead-end 대신 후보를 보여준다.
    if (resolution.candidates?.length) {
      return {
        tool: name,
        success: true,
        data: { matched: false, ambiguous: true, candidates: resolution.candidates.map((candidate) => candidate.title) },
        verification: createVerification({ executed: true }),
      };
    }
    return { tool: name, success: false, error: OLIVIA_FALLBACK_MESSAGES.featureNotFoundSoft(query) };
  }

  if (name === "search_documents" || name === "get_recent_documents") {
    const query = name === "search_documents" ? text(input, "query") : "";
    const clientName = text(input, "clientName") || undefined;
    const documentType = normalizeDocumentTypeHint(input.documentType);
    const limitInput = input.limit == null ? undefined : parseKoreanCount(input.limit as string | number);
    const docs = await searchDocuments({
      query,
      clientName,
      types: documentType ? [documentType] : undefined,
      limit: limitInput || 8,
      currentClientId: context.activeClientId,
      currentProjectId: context.activeProjectId,
    });
    if (name === "get_recent_documents") {
      return { tool: name, success: true, data: { documents: docs.map(toDocSummary) }, verification: createVerification({ executed: true, resourceExists: docs.length > 0 }) };
    }
    if (!docs.length) {
      const scopeLabel = [clientName, documentType ? DOCUMENT_TYPE_LABELS[documentType] : undefined].filter(Boolean).join(" ");
      return { tool: name, success: false, error: `${scopeLabel ? `${scopeLabel} ` : ""}문서를 찾지 못했어요. 고객명이나 문서 종류를 조금만 더 알려주세요.`, verification: createVerification({ executed: true, resourceExists: false }) };
    }
    return {
      tool: name,
      success: true,
      data: { matched: docs.length === 1, ambiguous: docs.length > 1, documents: docs.map(toDocSummary) },
      verification: createVerification({ executed: true, resourceExists: true }),
    };
  }

  if (name === "open_document") {
    const documentId = text(input, "documentId");
    const sep = documentId.indexOf(":");
    const sourceType = sep >= 0 ? documentId.slice(0, sep) : documentId;
    const sourceId = sep >= 0 ? documentId.slice(sep + 1) : "";
    if (!sourceId) throw new Error("어떤 문서인지 확인하지 못했어요.");

    if (sourceType === "quote" || sourceType === "contract" || sourceType === "conti") {
      const table = sourceType === "quote" ? "quotes" : sourceType === "contract" ? "contracts" : "conti_saves";
      const { data: row } = await db.from(table).select("id, hospital_name, client_id, workflow_run_id").eq("id", sourceId).maybeSingle();
      if (!row) throw new Error("문서를 찾지 못했어요.");
      const typeLabel = DOCUMENT_TYPE_LABELS[sourceType === "conti" ? "storyboard" : sourceType];
      return {
        tool: name,
        success: true,
        data: {
          workspace: sourceType,
          resourceId: String(row.id),
          clientId: row.client_id || undefined,
          workflowRunId: row.workflow_run_id || undefined,
          hospitalName: row.hospital_name || undefined,
          summary: `${row.hospital_name || "고객"} ${typeLabel}을 열었어요.`,
        },
        verification: createVerification({ executed: true, resourceExists: true }),
      };
    }
    if (sourceType === "select_gallery") {
      return { tool: name, success: true, data: { href: `/select-galleries/${sourceId}`, summary: "셀렉 갤러리를 열었어요." }, verification: createVerification({ executed: true }) };
    }
    if (sourceType === "memo" || sourceType === "photo_gallery") {
      const table = sourceType === "memo" ? "consultation_memos" : "photo_galleries";
      const clientColumn = sourceType === "memo" ? "hospital_id" : "client_id";
      const { data: row } = await db.from(table).select(`id, ${clientColumn}`).eq("id", sourceId).maybeSingle();
      const clientId = (row as Record<string, unknown> | null)?.[clientColumn];
      if (!clientId) throw new Error("문서를 찾지 못했어요.");
      return { tool: name, success: true, data: { href: `/clients?clientId=${clientId}`, summary: "관련 고객 화면을 열었어요." }, verification: createVerification({ executed: true, resourceExists: true }) };
    }
    throw new Error("지원하지 않는 문서 종류예요.");
  }

  throw new Error("지원하지 않는 Olivia 작업이에요.");
}
