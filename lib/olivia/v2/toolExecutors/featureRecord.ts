import { getSupabaseAdmin } from "@/lib/supabase";
import { executeOliviaCrud } from "@/lib/olivia/crud/executor";
import { validateOliviaCrudRequest } from "@/lib/olivia/crud/validation";
import type { OliviaCrudDomain, OliviaCrudRequest, OliviaCrudTarget } from "@/lib/olivia/crud/types";
import { isUuid } from "@/lib/assistant/validation";
import type { OliviaContextSnapshot, OliviaToolResult } from "@/lib/olivia/v2/types";
import { text } from "./common";
import { createVerification } from "./verification";

// 코드 요청서(2026-08-15) 3번 항목 — CRUD 엔진(lib/olivia/crud)은 12개 도메인을 지원하지만
// 챗 도구로는 quote/contract/conti 3개만 노출돼 있었다. client/workflow는 위험도가 높아
// (고객 원장 정보 직접 변경, 단계 강제 이동) 4번 항목(승인 게이트)이 실제로 막는 걸 확인한 뒤
// 2차로 열기로 하고, 1차는 나머지 7개 도메인만 연다.
export const OPEN_FEATURE_RECORD_DOMAINS: readonly OliviaCrudDomain[] = [
  "memo", "calendar", "photo_gallery", "select_gallery", "review", "mail_draft", "agent_task",
];

export const FEATURE_RECORD_TOOL_NAMES = ["create_feature_record", "update_feature_record", "apply_feature_record_write"] as const;

export async function executeFeatureRecordTool(
  name: string,
  input: Record<string, unknown>,
  _context: OliviaContextSnapshot,
): Promise<OliviaToolResult> {
  const db = getSupabaseAdmin();

  // ── 범용 기능 데이터 생성/수정 (코드 요청서 3·4번 항목, 2026-08-15) ──
  if (name === "create_feature_record" || name === "update_feature_record") {
    const domain = text(input, "domain") as OliviaCrudDomain;
    if (!OPEN_FEATURE_RECORD_DOMAINS.includes(domain)) {
      throw new Error(`"${domain}"은(는) 아직 챗에서 직접 생성·수정할 수 없는 기능이에요.`);
    }
    let data: Record<string, unknown>;
    try {
      const parsed = JSON.parse(text(input, "data") || "{}");
      data = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      throw new Error("data 형식(JSON 객체 문자열)이 올바르지 않아요.");
    }
    const operation = name === "create_feature_record" ? "create" as const : "update" as const;
    let target: OliviaCrudTarget | undefined;
    if (operation === "update") {
      const targetRaw = text(input, "target");
      if (!targetRaw) throw new Error("수정할 대상의 이름이나 ID가 필요해요.");
      target = isUuid(targetRaw) ? { id: targetRaw } : { name: targetRaw };
    }

    const crudRequest: OliviaCrudRequest = {
      operation,
      domain,
      data,
      target,
      requestText: text(input, "requestText") || undefined,
    };
    const validated = validateOliviaCrudRequest(crudRequest);

    // owner_only 필드가 섞이면 바로 실행하지 않고 승인 카드를 띄운다(코드 요청서 4번 항목) —
    // 실제 실행은 uiActionResolvers의 create_feature_record/update_feature_record 리졸버가
    // 만드는 REQUEST_APPROVAL 카드를 사용자가 확인해야 apply_feature_record_write로만 이뤄진다.
    if (validated.permission === "owner_only") {
      const fieldsSummary = Object.entries(validated.data)
        .slice(0, 6)
        .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
        .join(", ");
      return {
        tool: name,
        success: true,
        data: {
          approvalRequired: true,
          domain,
          operation,
          crudData: validated.data,
          target,
          summary: `${validated.definition.label} ${operation === "create" ? "생성" : "수정"} — ${fieldsSummary}. 승인이 필요한 항목(${validated.ownerOnlyChanged.join(", ")})이 포함돼 있어요. 진행할까요?`,
        },
        verification: createVerification({ executed: true, persisted: false }),
      };
    }

    const execution = await executeOliviaCrud(db, crudRequest);
    const reviewRequired = validated.permission === "review_required";
    const reviewNote = reviewRequired ? " (검토가 필요한 변경입니다.)" : "";
    return {
      tool: name,
      success: true,
      data: {
        recordId: execution.recordId,
        domain: execution.domain,
        operation: execution.operation,
        url: execution.url,
        // reviewRequired가 true면 모델이 summary를 재구성하며 이 안내를 누락할 수 있어
        // 별도 필드로도 노출한다 — operating_rules에서 이 필드를 그대로 전달하라고 명시한다.
        reviewRequired,
        reviewNotice: reviewRequired ? "검토가 필요한 변경입니다." : undefined,
        summary: `${execution.message}${reviewNote}`,
      },
      verification: createVerification({ executed: true, persisted: Boolean(execution.recordId), resourceExists: Boolean(execution.recordId) }),
    };
  }

  // apply_feature_record_write는 모델에게 노출되지 않는다 — /api/olivia/v2/approve가 승인 카드의
  // toolInput(operation/domain/crudData/target)을 그대로 실어 호출할 때만 실제로 DB에 쓴다.
  if (name === "apply_feature_record_write") {
    const operation = text(input, "operation") === "update" ? "update" as const : "create" as const;
    const domain = text(input, "domain") as OliviaCrudDomain;
    const data = input.crudData && typeof input.crudData === "object" && !Array.isArray(input.crudData)
      ? input.crudData as Record<string, unknown>
      : {};
    const target = input.target && typeof input.target === "object" && !Array.isArray(input.target)
      ? input.target as OliviaCrudTarget
      : undefined;
    const execution = await executeOliviaCrud(db, { operation, domain, data, target });
    return {
      tool: name,
      success: true,
      data: {
        recordId: execution.recordId,
        domain: execution.domain,
        operation: execution.operation,
        url: execution.url,
        summary: execution.message,
      },
      verification: createVerification({ executed: true, persisted: Boolean(execution.recordId), resourceExists: Boolean(execution.recordId) }),
    };
  }

  throw new Error("지원하지 않는 Olivia 작업이에요.");
}
