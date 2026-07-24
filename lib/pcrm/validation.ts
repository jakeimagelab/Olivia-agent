const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPcrmUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export type PcrmProjectInput = {
  projectName: string;
  projectType: string | null;
  shootingType: string | null;
  managerName: string;
  consultationDate: string | null;
  shootDate: string | null;
  startDate: string | null;
  expectedCompletionDate: string | null;
  expectedContractAmount: number | null;
  projectMemo: string;
  templateId: string | null;
};

function optionalDate(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return value;
}

export function validatePcrmProjectInput(input: Record<string, unknown>):
  | { ok: true; value: PcrmProjectInput }
  | { ok: false; error: string } {
  const projectName = String(input.project_name ?? input.projectName ?? "").trim();
  if (!projectName || projectName.length > 200) {
    return { ok: false, error: "프로젝트명은 1~200자로 입력해 주세요." };
  }

  const managerName = String(input.manager_name ?? input.managerName ?? "").trim();
  const projectMemo = String(input.project_memo ?? input.projectMemo ?? "").trim();
  if (projectMemo.length > 10_000) return { ok: false, error: "프로젝트 메모는 10,000자까지 입력할 수 있습니다." };

  const consultationDate = optionalDate(input.consultation_date ?? input.consultationDate);
  const shootDate = optionalDate(input.shoot_date ?? input.shootDate);
  const startDate = optionalDate(input.start_date ?? input.startDate);
  const expectedCompletionDate = optionalDate(input.expected_completion_date ?? input.expectedCompletionDate);
  if ([consultationDate, shootDate, startDate, expectedCompletionDate].includes(undefined)) {
    return { ok: false, error: "날짜 형식이 올바르지 않습니다." };
  }
  if (startDate && expectedCompletionDate && startDate > expectedCompletionDate) {
    return { ok: false, error: "시작일은 예상 완료일보다 늦을 수 없습니다." };
  }

  const amountRaw = input.expected_contract_amount ?? input.expectedContractAmount;
  const amount = amountRaw === undefined || amountRaw === null || amountRaw === ""
    ? null
    : Number(amountRaw);
  if (amount !== null && (!Number.isSafeInteger(amount) || amount < 0)) {
    return { ok: false, error: "계약 예정 금액이 올바르지 않습니다." };
  }

  const templateIdRaw = input.template_id ?? input.templateId;
  const templateId = templateIdRaw ? String(templateIdRaw) : null;
  if (templateId && !isPcrmUuid(templateId)) {
    return { ok: false, error: "워크플로우 템플릿 ID가 올바르지 않습니다." };
  }

  return {
    ok: true,
    value: {
      projectName,
      projectType: input.project_type || input.projectType ? String(input.project_type ?? input.projectType) : null,
      shootingType: input.shooting_type || input.shootingType ? String(input.shooting_type ?? input.shootingType) : null,
      managerName,
      consultationDate: consultationDate ?? null,
      shootDate: shootDate ?? null,
      startDate: startDate ?? null,
      expectedCompletionDate: expectedCompletionDate ?? null,
      expectedContractAmount: amount,
      projectMemo,
      templateId,
    },
  };
}
