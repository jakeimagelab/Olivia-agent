"use client";

import { C, EmptyBox, LoadingBox, Pill, SectionCard, useApi, WorkflowShell } from "../WorkflowComponents";

const fallback = { ok: true, templates: [] };

export default function WorkflowTemplatesPage() {
  const { data, loading, mock } = useApi<any>("/api/workflow/templates", fallback);
  const templates = data.templates || [];

  return (
    <WorkflowShell title="워크플로우 템플릿" subtitle="병원 촬영, 홈페이지 제작, SNS 구독, PER 리워드 플로우를 단계별로 관리하는 공간입니다.">
      {mock ? <div style={{ marginBottom: 14 }}><Pill color={C.orange}>기본 템플릿 샘플</Pill></div> : null}
      {loading ? <LoadingBox /> : templates.length ? (
        <div style={{ display: "grid", gap: 18 }}>
          {templates.map((template: any) => {
            const steps = template.steps || [];
            return (
              <SectionCard key={template.id} title={template.name} action={<Pill color={template.is_active ? C.green : C.hint}>{template.is_active ? "활성" : "비활성"}</Pill>}>
                <p style={{ margin: "0 0 16px", color: C.muted, lineHeight: 1.7 }}>{template.description}</p>
                <div style={{ display: "grid", gap: 8 }}>
                  {steps.sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0)).map((step: any, index: number) => {
                    const needsApproval = step.requires_approval ?? step.requiresApproval ?? false;
                    const createsMail = step.creates_mailing_draft ?? step.createsMail ?? false;

                    return (
                      <div key={step.id || step.key || step.step_key} style={{ display: "grid", gridTemplateColumns: "34px 1fr 110px 110px 90px", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.line}` }}>
                        <strong style={{ color: C.orange }}>{index + 1}</strong>
                        <div>
                          <div style={{ color: C.green, fontSize: 14, fontWeight: 1000 }}>{step.name}</div>
                          <div style={{ color: C.muted, fontSize: 12, marginTop: 3 }}>{step.description || step.next}</div>
                        </div>
                        <Pill color={needsApproval ? C.orange : C.hint}>{needsApproval ? "승인 필요" : "자동"}</Pill>
                        <Pill color={createsMail ? C.green : C.hint}>{createsMail ? "메일 초안" : "메일 없음"}</Pill>
                        <span style={{ color: C.muted, fontSize: 12 }}>{step.expected_days ?? step.days ?? 1}일</span>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            );
          })}
        </div>
      ) : <EmptyBox text="등록된 워크플로우 템플릿이 없습니다." />}
    </WorkflowShell>
  );
}
