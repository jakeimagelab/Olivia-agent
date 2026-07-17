import type { OliviaAnalysisResult, OliviaRuleCandidate, OliviaWorkflowContext } from "@/lib/olivia/types";

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    shouldNotify: { type: "boolean" },
    insightType: {
      type: "string",
      enum: ["risk", "delay", "missing_data", "customer_waiting", "approval_waiting", "commitment", "opportunity", "marketing", "recommendation"],
    },
    title: { type: "string" },
    summary: { type: "string" },
    reason: { type: "string" },
    urgencyScore: { type: "integer", minimum: 0, maximum: 100 },
    impactScore: { type: "integer", minimum: 0, maximum: 100 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    recommendedAction: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          properties: {
            actionType: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            permissionLevel: { type: "string", enum: ["auto", "review_required", "owner_only"] },
            dueAt: { type: ["string", "null"] },
            payload: { type: ["object", "null"], additionalProperties: true },
          },
          required: ["actionType", "title", "description", "permissionLevel", "dueAt", "payload"],
        },
        { type: "null" },
      ],
    },
  },
  required: ["shouldNotify", "insightType", "title", "summary", "reason", "urgencyScore", "impactScore", "confidence", "recommendedAction"],
};

function outputText(json: any): string {
  if (typeof json.output_text === "string") return json.output_text;
  for (const item of json.output ?? []) {
    for (const part of item.content ?? []) if (typeof part.text === "string") return part.text;
  }
  return "";
}

export async function analyzeOliviaCandidate(
  candidate: OliviaRuleCandidate,
  context: OliviaWorkflowContext,
): Promise<OliviaAnalysisResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || process.env.OLIVIA_AI_ANALYSIS_ENABLED === "false") return null;

  const input = {
    ruleId: candidate.ruleId,
    fact: {
      insightType: candidate.insightType,
      summary: candidate.summary,
      reason: candidate.reason,
      urgencyScore: candidate.urgencyScore,
      impactScore: candidate.impactScore,
      confidence: candidate.confidence,
    },
    workflow: {
      currentStepKey: context.workflowRun.current_step_key,
      status: context.workflowRun.status,
      shootDate: context.workflowRun.shoot_date,
      nextActionExists: Boolean(String(context.workflowRun.next_action || "").trim()),
      openTaskCount: context.tasks.filter((task) => ["pending", "running", "waiting_approval", "failed"].includes(task.status)).length,
      pendingApprovalCount: context.approvals.filter((approval) => approval.status === "pending").length,
    },
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_OLIVIA_MODEL || "gpt-4.1-mini",
      instructions: [
        "당신은 포토클리닉 내부 운영 비서 올리비아입니다.",
        "규칙이 추출한 사실을 바꾸거나 존재하지 않는 고객 정보를 만들지 마세요.",
        "고객 연락, 단계 이동, 외부 공개는 반드시 review_required 이상이어야 합니다.",
        "개인정보를 추론하거나 응답에 포함하지 마세요.",
      ].join(" "),
      input: JSON.stringify(input),
      text: { format: { type: "json_schema", name: "olivia_analysis", strict: true, schema: analysisSchema } },
    }),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error?.message || "Olivia AI 분석 실패");
  const text = outputText(json);
  if (!text) throw new Error("Olivia AI 분석 응답 없음");
  return JSON.parse(text) as OliviaAnalysisResult;
}
